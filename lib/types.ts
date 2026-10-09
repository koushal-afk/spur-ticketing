export type UserRole = 'admin' | 'executive' | 'store'
export const USER_ROLES: UserRole[] = ['admin', 'executive', 'store']

export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface Ticket {
  ticketId: string
  conversationId: string
  contactName: string
  contactPhone: string
  firstMessage: string
  lastMessage: string
  conversationSummary: string
  employeeComment: string
  assignedTo: string
  status: TicketStatus
  createdAt: string
  lastActiveAt: string
  updatedAt: string
  queryType?: string
  storeAssignedTo?: string
  storeComments?: string
  finalResolutionComments?: string
  // Newline-separated private photo paths in blob storage.
  photos?: string
  // When this ticket was opened by the app, and when it last moved to resolved/closed.
  openedAt?: string
  resolvedAt?: string
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
