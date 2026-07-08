import { NextRequest, NextResponse } from 'next/server'
import { appendTickets, ensureHeaders, getExistingConversationLastActive, updateTicketLiveData } from '@/lib/sheets'
import { summarizeConversation } from '@/lib/summarize'
import { Ticket, SpurConversation, SpurMessage } from '@/lib/types'
import { randomUUID } from 'crypto'

// This endpoint is called by the Claude scheduled task which has Spur MCP access.
// The scheduled task fetches Spur data and POSTs it here.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-poll-secret')
  if (secret !== process.env.POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { conversations, messagesMap } = body as {
      conversations: SpurConversation[]
      messagesMap: Record<string, SpurMessage[]>
    }

    await ensureHeaders()
    const existing = await getExistingConversationLastActive()

    const newConversations = conversations.filter(
      c => !existing.has(String(c.conversationId))
    )
    const updatedConversations = conversations.filter(
      c => existing.has(String(c.conversationId))
    )

    // Handle new tickets
    const newTickets: Ticket[] = []
    for (const conv of newConversations) {
      const messages = messagesMap[String(conv.conversationId)] ?? []
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

    // Update existing tickets with correct first/last message + summary
    for (const conv of updatedConversations) {
      const messages = messagesMap[String(conv.conversationId)] ?? []
      const messageTexts = messages.map(m => m.content?.text?.body ?? '').filter(Boolean)
      if (messageTexts.length === 0) continue
      const summary = await summarizeConversation(messageTexts)
      // messages are newest-first, so [0] = last, [length-1] = first
      await updateTicketLiveData(
        String(conv.conversationId),
        messageTexts[messageTexts.length - 1], // firstMessage
        messageTexts[0],                        // lastMessage
        summary,
        conv.lastMessageAt,
      )
    }

    return NextResponse.json({
      created: newTickets.length,
      updated: updatedConversations.length,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
