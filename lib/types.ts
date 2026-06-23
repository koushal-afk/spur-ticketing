export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high'

export interface TeamMember {
  name: string
  email: string
  phone: string
}

export interface Ticket {
  ticketId: string
  conversationId: string
  contactName: string
  contactPhone: string
  firstMessage: string
  lastMessage: string
  conversationSummary: string
  assignedTo: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  lastActiveAt: string
  updatedAt: string
}

export interface SpurConversation {
  conversationId: number
  contactId: number
  contactName: string
  contactPhone: string
  unreadCount: number
  lastMessagePreview: string
  lastMessageAt: string
  createdAt: string
}

export interface SpurMessage {
  id: string
  content: {
    text?: { body: string }
    type: string
  }
  sentDateTime: string
  sentViaSpur: boolean
  senderId: string
}
