import { getAllUsers, getOptions, getTicketById } from '@/lib/sheets'
import TicketDetail from '@/components/TicketDetail'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserRole } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Read the ticket fresh (not from the list cache) so a save followed by a reload shows the saved value.
  const [ticket, session, users, queryTypes] = await Promise.all([
    getTicketById(id),
    getServerSession(authOptions),
    getAllUsers(),
    getOptions('query_type'),
  ])
  if (!ticket) notFound()
  const userRole = (session?.user as unknown as { role?: UserRole })?.role ?? 'store'
  const userName = session?.user?.name ?? ''
  const storeUsers = users.filter(u => u.role === 'store')
  const cxUsers = users.filter(u => u.role === 'admin' || u.role === 'executive')
  return (
    <TicketDetail
      ticket={ticket}
      userRole={userRole}
      userName={userName}
      storeUsers={storeUsers}
      cxUsers={cxUsers}
      queryTypes={queryTypes}
    />
  )
}
