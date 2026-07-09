import { NextRequest, NextResponse } from 'next/server'
import { appendTickets, ensureHeaders, getExistingConversationLastActive } from '@/lib/sheets'
import { summarizeConversation } from '@/lib/summarize'
import { Ticket } from '@/lib/types'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // seconds (Vercel Pro / hobby max)

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

// Fetch messages for a single conversation; never throws — returns [] on failure
async function fetchMessages(conversationId: string): Promise<string[]> {
  try {
    const result = await spurRequest('conversation_messages', {
      conversationId: Number(conversationId),
      limit: 10,
    })
    const messages = (result.messages ?? []) as {
      recordType?: string
      sentViaSpur?: boolean
      content?: { text?: { body?: string } }
    }[]
    // Only keep real inbound/outbound messages (not events), extract text bodies
    return messages
      .filter(m => m.recordType === 'message')
      .map(m => m.content?.text?.body ?? '')
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // ── Step 1: paginate Spur to get all conversations active in last 7 days ──
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
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
        if (t && new Date(t) >= cutoff) conversations.push(c)
      }

      // Stop when the last item on the page is older than our cutoff
      const lastTime = batch[batch.length - 1]?.lastMessageAt as string | null
      if (!lastTime || new Date(lastTime) < cutoff) break
      if (!page.nextCursor) break
      cursor = page.nextCursor
    }

    if (conversations.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, message: 'No conversations in window' })
    }

    // ── Step 2: check sheet — which conversations actually need a new ticket ──
    await ensureHeaders()
    const existingLastActive = await getExistingConversationLastActive()

    const needsTicket = conversations.filter(c => {
      const convId = String(c.conversationId)
      const spurEpoch = Math.floor(new Date(c.lastMessageAt as string).getTime() / 1000)
      const sheetEpoch = existingLastActive.get(convId) ?? 0
      return spurEpoch > sheetEpoch
    })

    const skipped = conversations.length - needsTicket.length

    if (needsTicket.length === 0) {
      return NextResponse.json({ created: 0, skipped, message: 'All conversations already up to date' })
    }

    // ── Step 3: fetch messages ONLY for conversations that need a ticket ──
    //    Parallelise in batches of 10 to avoid overwhelming the Spur API
    const BATCH = 10
    const messagesMap: Record<string, string[]> = {}

    for (let i = 0; i < needsTicket.length; i += BATCH) {
      const batch = needsTicket.slice(i, i + BATCH)
      await Promise.all(
        batch.map(async c => {
          const convId = String(c.conversationId)
          messagesMap[convId] = await fetchMessages(convId)
        })
      )
    }

    // ── Step 4: summarise in parallel (all at once — each call is fast) ──
    const summaries: Record<string, string> = {}
    await Promise.all(
      needsTicket.map(async c => {
        const convId = String(c.conversationId)
        const s = c as Record<string, string | null>
        const texts = messagesMap[convId] ?? []
        summaries[convId] = texts.length > 0
          ? await summarizeConversation(texts)
          : (s.lastMessagePreview ?? '')
      })
    )

    // ── Step 5: build ticket rows and append in one shot ──
    const newTickets: Ticket[] = needsTicket.map(conv => {
      const s = conv as Record<string, string | null>
      const convId = String(conv.conversationId)
      const texts = messagesMap[convId] ?? []

      // messages are newest-first from Spur; reverse to get chronological order
      const firstMsg = texts[texts.length - 1] ?? s.lastMessagePreview ?? ''
      const lastMsg  = texts[0]               ?? s.lastMessagePreview ?? ''

      return {
        ticketId: `TKT-${randomUUID().slice(0, 8).toUpperCase()}`,
        conversationId: convId,
        contactName: s.contactName ?? 'Unknown',
        contactPhone: s.contactPhone ?? '',
        firstMessage: firstMsg,
        lastMessage: lastMsg,
        conversationSummary: summaries[convId] ?? '',
        assignedTo: 'Unassigned',
        status: 'open',
        priority: 'medium',
        createdAt: s.createdAt ?? new Date().toISOString(),
        lastActiveAt: s.lastMessageAt ?? '',
        updatedAt: new Date().toISOString(),
      }
    })

    await appendTickets(newTickets)

    return NextResponse.json({
      created: newTickets.length,
      skipped,
      total_in_window: conversations.length,
    })
  } catch (e) {
    console.error('[cron] fatal:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
