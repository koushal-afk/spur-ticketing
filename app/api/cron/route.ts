import { NextRequest, NextResponse } from 'next/server'
import { appendTickets, ensureHeaders, getExistingConversations, updateTicketLiveData } from '@/lib/sheets'
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

// Spur's conversation_search sorts by conversationId (creation order), not lastMessageAt.
// Old conversations that get new messages never appear in the unfiltered list.
// Strategy: fetch two passes and merge —
//   Pass 1 (recent): conversations CREATED in the last 24h (stop when createdAt < since)
//   Pass 2 (unread):  all conversations with unread messages regardless of age
// This catches brand-new chats (pass 1) and old conversations with new customer messages (pass 2).
async function fetchRecentConversations(): Promise<Record<string, unknown>[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const seen = new Set<string>()
  const conversations: Record<string, unknown>[] = []

  // ── Pass 1: recently CREATED conversations (stop on createdAt cutoff) ──
  let cursor: number | undefined
  while (true) {
    const params: Record<string, unknown> = { channelType: 'whatsapp', limit: 50 }
    if (cursor !== undefined) params.cursor = cursor
    let page: Record<string, unknown>
    try { page = await spurRequest('conversation_search', params) }
    catch (e) { console.error('[cron] pass1 failed:', e); break }

    const batch = (page.conversations as Record<string, unknown>[]) ?? []
    if (batch.length === 0) break

    let hitCutoff = false
    for (const c of batch) {
      const created = c.createdAt as string | null
      // Stop once conversations are older than 24h (list is newest-created first)
      if (!created || new Date(created) < since) { hitCutoff = true; break }
      const id = String(c.conversationId)
      if (!seen.has(id)) { seen.add(id); conversations.push(c) }
    }
    if (hitCutoff || !page.nextCursor) break
    cursor = page.nextCursor as number
  }

  // ── Pass 2: unread conversations (any age — catches old convos with new customer messages) ──
  cursor = undefined
  while (true) {
    const params: Record<string, unknown> = { channelType: 'whatsapp', limit: 50, unreadOnly: true }
    if (cursor !== undefined) params.cursor = cursor
    let page: Record<string, unknown>
    try { page = await spurRequest('conversation_search', params) }
    catch (e) { console.error('[cron] pass2 failed:', e); break }

    const batch = (page.conversations as Record<string, unknown>[]) ?? []
    if (batch.length === 0) break

    for (const c of batch) {
      const id = String(c.conversationId)
      if (!seen.has(id)) { seen.add(id); conversations.push(c) }
    }
    if (!page.nextCursor) break
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
  //   needsNewTicket  — no ticket yet, OR latest ticket is closed/resolved (re-opened issue)
  //   needsUpdate     — latest ticket is open/in_progress AND there's a newer message from Spur
  const needsNewTicket: Record<string, unknown>[] = []
  const needsUpdate: Record<string, unknown>[] = []
  let skipped = 0

  for (const conv of conversations) {
    const id = String(conv.conversationId)
    const info = existing.get(id)
    const spurEpoch = conv.lastMessageAt
      ? Math.floor(new Date(conv.lastMessageAt as string).getTime() / 1000)
      : 0

    if (!info) {
      // Brand-new conversation — always create ticket
      needsNewTicket.push(conv)
    } else if (info.status === 'closed' || info.status === 'resolved') {
      // Customer messaged again after close — create a fresh ticket
      if (spurEpoch > info.epoch) {
        needsNewTicket.push(conv)
      } else {
        skipped++
      }
    } else {
      // open or in_progress — update if there's genuinely a newer message
      if (spurEpoch > info.epoch) {
        needsUpdate.push(conv)
      } else {
        skipped++
      }
    }
  }

  // Cap new ticket creation per run; remainder caught by next 5-min run
  const toCreate = needsNewTicket.slice(0, MAX_NEW_PER_RUN)

  // Fetch messages in parallel batches
  const createIds = toCreate.map(c => String(c.conversationId))
  const updateIds = needsUpdate.map(c => String(c.conversationId))

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

  // ── Update existing open tickets ──────────────────────────────────────────
  await Promise.all(
    needsUpdate.map(async conv => {
      const id = String(conv.conversationId)
      const s = conv as Record<string, string | null>
      const texts = updateMsgs[id] ?? []
      if (texts.length === 0) return
      const summary = await safeSum(texts, texts[0] ?? s.lastMessagePreview ?? '')
      await updateTicketLiveData(
        id,
        texts[texts.length - 1], // firstMessage (oldest)
        texts[0],                 // lastMessage  (newest)
        summary,
        s.lastMessageAt ?? '',
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
    const conversations = await fetchRecentConversations()
    const result = await processConversations(conversations)
    return NextResponse.json({ ...result, total_fetched: conversations.length })
  } catch (e) {
    console.error('[cron] fatal:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
