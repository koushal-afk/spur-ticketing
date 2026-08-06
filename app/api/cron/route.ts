import { NextRequest, NextResponse } from 'next/server'
import { appendTickets, ensureHeaders, getExistingConversations, updateTicketLiveData, getCronWatermark, setCronWatermark } from '@/lib/sheets'
import { summarizeConversation } from '@/lib/summarize'
import { Ticket } from '@/lib/types'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SPUR_BASE = 'https://api.spurnow.com/mcp'

// ── Spur API ──────────────────────────────────────────────────────────────────

async function spurRequest(tool: string, params: Record<string, unknown>) {
  const apiKey = process.env.SPUR_API_KEY
  const res = await fetch(`${SPUR_BASE}?api_key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: params },
    }),
  })
  if (!res.ok) throw new Error(`Spur HTTP ${res.status}`)
  const data = await res.json()
  const text = data?.result?.content?.[0]?.text ?? data?.content?.[0]?.text
  if (!text) throw new Error(`Spur ${tool} empty response: ${JSON.stringify(data).slice(0, 200)}`)
  return JSON.parse(text)
}

// Fetch up to 10 customer message texts for a conversation (newest-first).
async function fetchMessageTexts(conversationId: string): Promise<string[]> {
  try {
    const result = await spurRequest('conversation_messages', {
      conversationId: Number(conversationId),
      limit: 10,
    })
    return (result.messages ?? [])
      .filter((m: { recordType?: string; sentViaSpur?: boolean }) =>
        m.recordType === 'message' && !m.sentViaSpur  // inbound customer messages only
      )
      .map((m: { content?: { text?: { body?: string } } }) => m.content?.text?.body ?? '')
      .filter(Boolean)
  } catch {
    return []
  }
}

// Spur returns conversation_search results ordered by lastMessageAt descending.
// We paginate and stop as soon as lastMessageAt <= watermark.
// This catches ALL conversations with any activity since the last run —
// read or unread, inbound or outbound — in a single pass.
// For a 5-minute window this is typically 1-2 pages of 50.
async function fetchConversationsSince(watermark: Date): Promise<Record<string, unknown>[]> {
  const seen = new Set<string>()
  const conversations: Record<string, unknown>[] = []
  let cursor: number | undefined

  while (true) {
    const params: Record<string, unknown> = { channelType: 'whatsapp', limit: 50 }
    if (cursor !== undefined) params.cursor = cursor

    let page: Record<string, unknown>
    try { page = await spurRequest('conversation_search', params) }
    catch (e) { console.error('[cron] conversation_search failed:', e); break }

    const batch = (page.conversations as Record<string, unknown>[]) ?? []
    if (batch.length === 0) break

    let reachedCutoff = false
    for (const c of batch) {
      const lastMsgAt = c.lastMessageAt as string | null
      // Stop once we see conversations whose last activity predates the watermark
      if (!lastMsgAt || new Date(lastMsgAt) <= watermark) { reachedCutoff = true; break }
      const id = String(c.conversationId)
      if (!seen.has(id)) { seen.add(id); conversations.push(c) }
    }

    if (reachedCutoff || !page.nextCursor) break
    cursor = page.nextCursor as number
  }

  return conversations
}

// ── Core processing ───────────────────────────────────────────────────────────

// Batch size for parallel Spur message fetches — keep low to avoid rate limits.
const FETCH_BATCH = 5
// Max new tickets per run — message fetch + summarise is slow; remaining will
// be picked up by the next 5-minute run.
const MAX_NEW_PER_RUN = 10
// If a conversation's new activity arrives more than this long after its ticket's
// last activity, treat it as a new issue (new ticket) instead of continuing the old one —
// regardless of the old ticket's status (open, in_progress, resolved, or closed).
const GRACE_WINDOW_MS = 3 * 60 * 60 * 1000

async function batchFetchMessages(ids: string[]): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {}
  for (let i = 0; i < ids.length; i += FETCH_BATCH) {
    await Promise.all(
      ids.slice(i, i + FETCH_BATCH).map(async id => {
        map[id] = await fetchMessageTexts(id)
      })
    )
  }
  return map
}

async function safeSum(texts: string[], fallback: string): Promise<string> {
  try {
    return texts.length > 0 ? await summarizeConversation(texts) : fallback
  } catch {
    return texts[0] ?? fallback
  }
}

export async function processConversations(conversations: Record<string, unknown>[]): Promise<{
  created: number
  updated: number
  skipped: number
}> {
  if (conversations.length === 0) return { created: 0, updated: 0, skipped: 0 }

  await ensureHeaders()
  const existing = await getExistingConversations()

  // Classify each conversation:
  //   needsNewTicket  — no existing ticket, OR the gap since the existing ticket's last
  //                     activity exceeds GRACE_WINDOW_MS (new issue, regardless of status)
  //   needsUpdate     — there's a newer message AND it arrived within the grace window of
  //                     the existing ticket's last activity (same issue continuing); if that
  //                     ticket was closed/resolved, it gets reopened to 'open'
  const needsNewTicket: Record<string, unknown>[] = []
  const needsUpdate: { conv: Record<string, unknown>; reopen: boolean }[] = []
  let skipped = 0

  for (const conv of conversations) {
    const id = String(conv.conversationId)
    const info = existing.get(id)
    // info.epoch is UTC ms; compare to Spur's lastMessageAt also in UTC ms
    const spurMs = conv.lastMessageAt
      ? new Date(conv.lastMessageAt as string).getTime()
      : 0

    if (!info) {
      needsNewTicket.push(conv)
    } else if (spurMs <= info.epoch) {
      skipped++
    } else if (spurMs - info.epoch >= GRACE_WINDOW_MS) {
      // Gap since last activity is beyond the grace window — new issue, new ticket.
      needsNewTicket.push(conv)
    } else {
      // Within the grace window — same issue, continue the existing ticket.
      needsUpdate.push({ conv, reopen: info.status === 'closed' || info.status === 'resolved' })
    }
  }

  // Cap new ticket creation per run; remainder caught by next 5-min run
  const toCreate = needsNewTicket.slice(0, MAX_NEW_PER_RUN)

  // Fetch messages in parallel batches
  const createIds = toCreate.map(c => String(c.conversationId))
  const updateIds = needsUpdate.map(u => String(u.conv.conversationId))

  const [createMsgs, updateMsgs] = await Promise.all([
    batchFetchMessages(createIds),
    batchFetchMessages(updateIds),
  ])

  // ── Create new tickets ────────────────────────────────────────────────────
  const newTickets: Ticket[] = await Promise.all(
    toCreate.map(async conv => {
      const id = String(conv.conversationId)
      const s = conv as Record<string, string | null>
      const texts = createMsgs[id] ?? []
      const fallback = s.lastMessagePreview ?? ''
      return {
        ticketId: `TKT-${randomUUID().slice(0, 8).toUpperCase()}`,
        conversationId: id,
        contactName: s.contactName ?? 'Unknown',
        contactPhone: s.contactPhone ?? '',
        // messages are newest-first: last element = oldest = first message customer sent
        firstMessage: texts[texts.length - 1] ?? fallback,
        lastMessage: texts[0] ?? fallback,
        conversationSummary: await safeSum(texts, fallback),
        employeeComment: '',
        assignedTo: 'Unassigned',
        status: 'open',
        priority: 'medium',
        createdAt: s.createdAt ?? new Date().toISOString(),
        lastActiveAt: s.lastMessageAt ?? '',
        updatedAt: new Date().toISOString(),
      }
    })
  )
  if (newTickets.length > 0) await appendTickets(newTickets)

  // ── Update existing tickets (reopening closed/resolved ones within the grace window) ──
  await Promise.all(
    needsUpdate.map(async ({ conv, reopen }) => {
      const id = String(conv.conversationId)
      const s = conv as Record<string, string | null>
      const texts = updateMsgs[id] ?? []
      // Even with no inbound messages, always update lastActiveAt so the ticket
      // stays in sync with Spur and doesn't fall behind the watermark next run.
      const summary = texts.length > 0
        ? await safeSum(texts, texts[0] ?? s.lastMessagePreview ?? '')
        : undefined
      await updateTicketLiveData(
        id,
        texts[texts.length - 1] ?? s.lastMessagePreview ?? '',
        texts[0] ?? s.lastMessagePreview ?? '',
        summary,
        s.lastMessageAt ?? '',
        reopen ? 'open' : undefined,
      ).catch(e => console.error(`[cron] updateTicketLiveData ${id}:`, e))
    })
  )

  return { created: newTickets.length, updated: needsUpdate.length, skipped }
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const runStart = new Date()

    // ?hours=N overrides the watermark for a one-time catch-up run (e.g. hours=24)
    const hoursOverride = req.nextUrl.searchParams.get('hours')
    const watermark = hoursOverride
      ? new Date(Date.now() - Number(hoursOverride) * 60 * 60 * 1000)
      : await getCronWatermark()

    const conversations = await fetchConversationsSince(watermark)
    const result = await processConversations(conversations)

    // Only advance the watermark after successful processing
    await setCronWatermark(runStart)

    return NextResponse.json({
      ...result,
      total_fetched: conversations.length,
      watermark_was: watermark.toISOString(),
      watermark_now: runStart.toISOString(),
    })
  } catch (e) {
    console.error('[cron] fatal:', e)
    // Watermark is NOT updated on failure — next run will retry from same point
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
