import { NextRequest, NextResponse } from 'next/server'
import { appendTickets, ensureHeaders, getExistingConversationIds, updateTicketLiveData } from '@/lib/sheets'
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
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Step 1: fetch conversations
    const convResult = await spurRequest('conversation_search', { channelType: 'whatsapp', limit: 50 })
    const conversations = convResult.conversations ?? []

    // Step 2: fetch messages for each conversation in parallel (batches of 10)
    const messagesMap: Record<string, unknown[]> = {}
    const batchSize = 10
    for (let i = 0; i < conversations.length; i += batchSize) {
      const batch = conversations.slice(i, i + batchSize)
      await Promise.all(batch.map(async (conv: { conversationId: number }) => {
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

    // Step 3: process into sheets (same logic as /api/poll)
    await ensureHeaders()
    const existing = await getExistingConversationIds()

    const newConversations = conversations.filter(
      (c: { conversationId: number }) => !existing.has(String(c.conversationId))
    )
    const updatedConversations = conversations.filter(
      (c: { conversationId: number }) => existing.has(String(c.conversationId))
    )

    const newTickets: Ticket[] = []
    for (const conv of newConversations) {
      const messages = (messagesMap[String(conv.conversationId)] ?? []) as { content?: { text?: { body?: string } } }[]
      const messageTexts = messages.map(m => m.content?.text?.body ?? '').filter(Boolean)
      const summary = messageTexts.length > 0
        ? await summarizeConversation(messageTexts)
        : conv.lastMessagePreview

      const firstMsg = messageTexts[messageTexts.length - 1] ?? conv.lastMessagePreview
      const lastMsg = messageTexts[0] ?? conv.lastMessagePreview

      newTickets.push({
        ticketId: `TKT-${randomUUID().slice(0, 8).toUpperCase()}`,
        conversationId: String(conv.conversationId),
        contactName: conv.contactName ?? 'Unknown',
        contactPhone: conv.contactPhone ?? '',
        firstMessage: firstMsg,
        lastMessage: lastMsg,
        conversationSummary: summary,
        assignedTo: 'Unassigned',
        status: 'open',
        priority: 'medium',
        createdAt: conv.createdAt,
        lastActiveAt: conv.lastMessageAt,
        updatedAt: new Date().toISOString(),
      })
    }
    await appendTickets(newTickets)

    for (const conv of updatedConversations) {
      const messages = (messagesMap[String(conv.conversationId)] ?? []) as { content?: { text?: { body?: string } } }[]
      const messageTexts = messages.map(m => m.content?.text?.body ?? '').filter(Boolean)
      if (messageTexts.length === 0) continue
      const summary = await summarizeConversation(messageTexts)
      await updateTicketLiveData(
        String(conv.conversationId),
        messageTexts[messageTexts.length - 1],
        messageTexts[0],
        summary,
        conv.lastMessageAt,
      )
    }

    return NextResponse.json({ created: newTickets.length, updated: updatedConversations.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
