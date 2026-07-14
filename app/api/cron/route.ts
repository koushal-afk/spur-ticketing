import { NextRequest, NextResponse } from 'next/server'
import { appendTickets, ensureHeaders, getExistingConversationLastActive } from '@/lib/sheets'
import { summarizeConversation } from '@/lib/summarize'
import { Ticket } from '@/lib/types'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SPUR_API = 'https://api.spurnow.com/mcp'

async function spurRequest(tool: string, params: Record<string, unknown>) {
  const apiKey = process.env.SPUR_API_KEY
  const res = await fetch(`${SPUR_API}?api_key=${apiKey}`, {
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
  const data = await res.json()
  const text = data?.result?.content?.[0]?.text ?? data?.content?.[0]?.text
  if (!text) throw new Error(`Spur ${tool} returned no content: ${JSON.stringify(data).slice(0, 200)}`)
  return JSON.parse(text)
}

async function fetchMessageTexts(conversationId: string): Promise<string[]> {
  try {
    const result = await spurRequest('conversation_messages', {
      conversationId: Number(conversationId),
      limit: 10,
    })
    return (result.messages ?? [])
      .filter((m: { recordType?: string }) => m.recordType === 'message')
      .map((m: { content?: { text?: { body?: string } } }) => m.content?.text?.body ?? '')
      .filter(Boolean)
  } catch {
    return []
  }
}

// Shared processing logic used by both cron and backfill
export async function processConversations(
  conversations: Record<string, unknown>[],
  maxNew?: number
): Promise<{ created: number; skipped: number }> {
  if (conversations.length === 0) return { created: 0, skipped: 0 }

  await ensureHeaders()
  const existingLastActive = await getExistingConversationLastActive()

  // Create a new ticket when the customer's latest message falls on a different IST
  // calendar date than the most recent ticket in the sheet. This means one ticket per
  // conversation per day — multiple messages in the same day stay on one ticket, but
  // returning the next day (or later) always opens a fresh ticket.
  const IST_OFFSET = 5.5 * 60 * 60 // UTC+5:30 in seconds
  const toISTDate = (epochSeconds: number) => {
    const istMs = (epochSeconds + IST_OFFSET) * 1000
    return new Date(istMs).toISOString().slice(0, 10) // "YYYY-MM-DD"
  }
  const needsTicket = conversations.filter(c => {
    const convId = String(c.conversationId)
    const spurEpoch = Math.floor(new Date(c.lastMessageAt as string).getTime() / 1000)
    const sheetEpoch = existingLastActive.get(convId) ?? 0
    if (sheetEpoch === 0) return true // brand new conversation
    return toISTDate(spurEpoch) !== toISTDate(sheetEpoch)
  })

  const totalNeedingTicket = needsTicket.length
  // Apply cap after filtering so we never skip a conversation just because it's ranked lower
  // in recency — only the expensive work (message fetch + summarize) is capped per run.
  if (maxNew !== undefined) needsTicket.splice(maxNew)
  const skipped = conversations.length - totalNeedingTicket
  if (needsTicket.length === 0) return { created: 0, skipped }

  // Fetch messages only for conversations that need a ticket (parallel, batches of 10)
  const messagesMap: Record<string, string[]> = {}
  const BATCH = 10
  for (let i = 0; i < needsTicket.length; i += BATCH) {
    await Promise.all(
      needsTicket.slice(i, i + BATCH).map(async c => {
        const id = String(c.conversationId)
        messagesMap[id] = await fetchMessageTexts(id)
      })
    )
  }

  // Summarise in parallel
  const summaries: Record<string, string> = {}
  await Promise.all(
    needsTicket.map(async c => {
      const id = String(c.conversationId)
      const s = c as Record<string, string | null>
      const texts = messagesMap[id] ?? []
      summaries[id] = texts.length > 0
        ? await summarizeConversation(texts)
        : (s.lastMessagePreview ?? '')
    })
  )

  const newTickets: Ticket[] = needsTicket.map(conv => {
    const s = conv as Record<string, string | null>
    const id = String(conv.conversationId)
    const texts = messagesMap[id] ?? []
    return {
      ticketId: `TKT-${randomUUID().slice(0, 8).toUpperCase()}`,
      conversationId: id,
      contactName: s.contactName ?? 'Unknown',
      contactPhone: s.contactPhone ?? '',
      firstMessage: texts[texts.length - 1] ?? s.lastMessagePreview ?? '',
      lastMessage: texts[0] ?? s.lastMessagePreview ?? '',
      conversationSummary: summaries[id] ?? '',
      employeeComment: '',
      assignedTo: 'Unassigned',
      status: 'open',
      priority: 'medium',
      createdAt: s.createdAt ?? new Date().toISOString(),
      lastActiveAt: s.lastMessageAt ?? '',
      updatedAt: new Date().toISOString(),
    }
  })

  await appendTickets(newTickets)
  return { created: newTickets.length, skipped }
}

// Fetch conversations active since `since` date, paginating until older than cutoff
async function fetchConversationsSince(since: Date): Promise<Record<string, unknown>[]> {
  const conversations: Record<string, unknown>[] = []
  let cursor: number | undefined = undefined

  while (true) {
    const params: Record<string, unknown> = { channelType: 'whatsapp', limit: 50 }
    if (cursor !== undefined) params.cursor = cursor

    const page = await spurRequest('conversation_search', params)
    const batch: Record<string, unknown>[] = page.conversations ?? []
    if (batch.length === 0) break

    for (const c of batch) {
      const t = c.lastMessageAt as string | null
      if (t && new Date(t) >= since) conversations.push(c)
    }

    const lastTime = batch[batch.length - 1]?.lastMessageAt as string | null
    if (!lastTime || new Date(lastTime) < since) break
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }

  return conversations
}

// Regular cron: 24h lookback so no conversation is ever missed, capped at 15 new tickets
// per run to stay well within Vercel's 60s limit. Remaining new tickets are picked up by
// subsequent 5-minute runs.
const MAX_PER_RUN = 15

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h window
    const allConversations = await fetchConversationsSince(since)
    const result = await processConversations(allConversations, MAX_PER_RUN)
    return NextResponse.json({
      ...result,
      window_hours: 24,
      total_in_window: allConversations.length,
    })
  } catch (e) {
    console.error('[cron] fatal:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
