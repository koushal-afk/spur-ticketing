import { getAllTickets } from '@/lib/sheets'
import TicketTable from '@/components/TicketTable'
import Header from '@/components/Header'
import { TicketStatus } from '@/lib/types'
import { CheckCircle, Clock, AlertCircle, MessageSquare } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserRole } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [tickets, session] = await Promise.all([getAllTickets(), getServerSession(authOptions)])
  const role = (session?.user as unknown as { role?: UserRole })?.role ?? 'employee'
  const userEmail = session?.user?.email ?? ''

  const visibleTickets = role === 'employee'
    ? tickets.filter(t => t.assignedTo === (session?.user?.name ?? userEmail))
    : tickets

  const counts: Record<TicketStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
  for (const t of visibleTickets) counts[t.status] = (counts[t.status] ?? 0) + 1

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={{ name: session?.user?.name ?? '', email: userEmail, role }} />

      <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-4 sm:space-y-6">
        {/* Stats — 2 cols on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
              <AlertCircle size={18} className="text-blue-600" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">{counts.open}</div>
              <div className="text-xs text-gray-500">Open</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-yellow-50 rounded-lg flex items-center justify-center shrink-0">
              <Clock size={18} className="text-yellow-600" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">{counts.in_progress}</div>
              <div className="text-xs text-gray-500">In Progress</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
              <CheckCircle size={18} className="text-green-600" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">{counts.resolved}</div>
              <div className="text-xs text-gray-500">Resolved</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
              <MessageSquare size={18} className="text-gray-500" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">{visibleTickets.length}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            {role === 'employee' ? 'My Tickets' : 'All Tickets'}
          </h2>
          <TicketTable initialTickets={visibleTickets} userRole={role} />
        </div>
      </main>
    </div>
  )
}
