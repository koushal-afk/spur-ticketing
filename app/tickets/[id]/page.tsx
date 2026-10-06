import { getAllTickets, getAllUsers } from '@/lib/sheets'
import TicketDetail from '@/components/TicketDetail'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserRole } from '@/lib/types'

export const revalidate = 0

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [tickets, session, users] = await Promise.all([
    getAllTickets(),
    getServerSession(authOptions),
    getAllUsers(),
  ])
  const ticket = tickets.find(t => t.ticketId === id)
  if (!ticket) notFound()
  const userRole = (session?.user as unknown as { role?: UserRole })?.role ?? 'employee'
  const userName = session?.user?.name ?? ''
  const storeUsers = users.filter(u => u.role === 'store')
  return <TicketDetail ticket={ticket} userRole={userRole} userName={userName} storeUsers={storeUsers} />
}
