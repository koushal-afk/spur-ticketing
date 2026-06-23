import { getAllTickets } from '@/lib/sheets'
import TicketDetail from '@/components/TicketDetail'
import { notFound } from 'next/navigation'

export const revalidate = 0

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tickets = await getAllTickets()
  const ticket = tickets.find(t => t.ticketId === id)
  if (!ticket) notFound()
  return <TicketDetail ticket={ticket} />
}
