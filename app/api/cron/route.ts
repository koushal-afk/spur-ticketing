import { NextRequest, NextResponse } from 'next/server'
import { appendTickets, ensureHeaders, getExistingConversationLastActive } from '@/lib/sheets'
import { summarizeConversation } from '@/lib/summarize'
import { Ticket } from '@/lib/types'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const SPUR_API = 'https://api.spurnow.com/mcp'

async function spurRequest(tool: string, params: Record<string, unknown>) {
  const apiKey = process.env.SPUR_API_KEY
  const res = await fetch(`${SPUR_API}?api_key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: params },
    }),
  })
  const data = await res.json()
  // Handle both wrapped (result.content) and direct response formats
  const text = data?.result?.content?.[0]?.text ?? data?.content?.[0]?.text
  if (!text) throw new Error(`Spur ${tool} returned no content: ${JSON.stringify(data).slice(0, 200)}`)
  return JSON.parse(text)
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Step 1: fetch all conversations active in the last 7 days (paginate until we go past that window)
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const conversations: Record<string, unknown>[] = []
    let cursor: number | undefined = undefined

    while (true) {
      const params: Record<string, unknown> = { channelType: 'whatsapp', limit: 50 }
      if (cursor) params.cursor = cursor
      const page = await spurRequest('conversation_search', params)
      const batch: Record<string, unknown>[] = page.conversations ?? []
      if (batch.length === 0) break

      // Keep conversations with recent activity; stop paginating once all are older than cutoff
      const recent = batch.filter(c => {
        const t = c.lastMessageAt as string | null
        return t ? new Date(t) >= cutoff : false
      })
      conversations.push(...recent)

      // If the last conversation on this page is older than cutoff, no need to go further
      const last = batch[batch.length - 1]
      const lastTime = last?.lastMessageAt as string | null
      if (!lastTime || new Date(lastTime) < cutoff) break
      if (!page.nextCursor) break
      cursor = page.nextCursor
    }

    // Step 2: fetch messages for each conversation in parallel (batches of 10)
    const messagesMap: Record<string, unknown[]> = {}
    const batchSize = 10
    for (let i = 0; i < conversations.length; i += batchSize) {
      const batch = conversations.slice(i, i + batchSize)
      await Promise.all(batch.map(async (conv: Record<string, unknown>) => {
        try {
          const msgResult = await spurRequest('conversation_messages', {
            conversationId: conv.conversationId,
            limit: 10,
          })
          messagesMap[String(conv.conversationId)] = msgResult.messages ?? []
        } catch {
          messagesMap[String(conv.conversationId)] = []
        }
      }))
    }

    // Step 3: determine which conversations need a new ticket
    await ensureHeaders()
    const existingLastActive = await getExistingConversationLastActive()

    // Create a new ticket if:
    //   a) conversation has never been seen before, OR
    //   b) it has been seen but has NEW activity since the last recorded lastActiveAt
    const toTicket = conversations.filter(c => {
      const convId = String(c.conversationId)
      const spurEpoch = Math.floor(new Date(c.lastMessageAt as string).getTime() / 1000)
      const sheetEpoch = existingLastActive.get(convId) ?? 0
      return spurEpoch > sheetEpoch  // new activity
    })

    const newTickets: Ticket[] = []
    for (const conv of toTicket) {
      const s = conv as Record<string, string | null>
      const messages = (messagesMap[String(conv.conversationId)] ?? []) as { content?: { text?: { body?: string } } }[]
      const messageTexts = messages.map(m => m.content?.text?.body ?? '').filter(Boolean)
      const summary = messageTexts.length > 0
        ? await summarizeConversation(messageTexts)
        : (s.lastMessagePreview ?? '')

      const firstMsg = messageTexts[messageTexts.length - 1] ?? s.lastMessagePreview ?? ''
      const lastMsg = messageTexts[0] ?? s.lastMessagePreview ?? ''

      newTickets.push({
        ticketId: `TKT-${randomUUID().slice(0, 8).toUpperCase()}`,
        conversationId: String(conv.conversationId),
        contactName: s.contactName ?? 'Unknown',
        contactPhone: s.contactPhone ?? '',
        firstMessage: firstMsg,
        lastMessage: lastMsg,
        conversationSummary: summary,
        assignedTo: 'Unassigned',
        status: 'open',
        priority: 'medium',
        createdAt: s.createdAt ?? new Date().toISOString(),
        lastActiveAt: s.lastMessageAt ?? '',
        updatedAt: new Date().toISOString(),
      })
    }
    await appendTickets(newTickets)

    return NextResponse.json({ created: newTickets.length, skipped: conversations.length - newTickets.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
