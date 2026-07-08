import { getAllTickets } from '@/lib/sheets'
import TicketDetail from '@/components/TicketDetail'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserRole } from '@/lib/types'

export const revalidate = 0

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [tickets, session] = await Promise.all([getAllTickets(), getServerSession(authOptions)])
  const ticket = tickets.find(t => t.ticketId === id)
  if (!ticket) notFound()
  const userRole = (session?.user as unknown as { role?: UserRole })?.role ?? 'employee'
  return <TicketDetail ticket={ticket} userRole={userRole} />
}
