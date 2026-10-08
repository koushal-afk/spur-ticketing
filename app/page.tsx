import { getAllTickets, getAllUsers, getOptions } from '@/lib/sheets'
import TicketTable from '@/components/TicketTable'
import Header from '@/components/Header'
import { CheckCircle, Clock, AlertCircle, MessageSquare } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { isAssigned } from '@/lib/workflow'
import { parseFilters, queryTickets } from '@/lib/ticketQuery'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [tickets, session, users, queryTypes, sp] = await Promise.all([
    getAllTickets(),
    getServerSession(authOptions),
    getAllUsers(),
    getOptions('query_type'),
    searchParams,
  ])
  const role = (session?.user as unknown as { role?: UserRole })?.role ?? 'store'
  const userEmail = session?.user?.email ?? ''
  const userName = session?.user?.name ?? userEmail

  // Anything other than a known role (e.g. a stale "employee" session) sees nothing.
  const visible = role === 'admin' || role === 'executive'
    ? tickets
    : role === 'store'
    ? tickets.filter(t => t.storeAssignedTo === userName)
    : []

  const filters = parseFilters(sp)
  const result = queryTickets(visible, filters)

  // Names already on tickets stay selectable even if that login was since removed.
  const sortedUnique = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const cxOptions = sortedUnique([
    ...users.filter(u => u.role === 'admin' || u.role === 'executive').map(u => u.name),
    ...visible.map(t => t.assignedTo).filter(isAssigned),
  ])
  const storeOptions = sortedUnique([
    ...users.filter(u => u.role === 'store').map(u => u.name),
    ...visible.map(t => t.storeAssignedTo ?? ''),
  ])
  const typeOptions = Array.from(new Set([...queryTypes, ...visible.map(t => t.queryType ?? '').filter(Boolean)]))

  const stat = (label: string, value: number, icon: React.ReactNode, tint: string) => (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-3">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>{icon}</div>
      <div>
        <div className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{value.toLocaleString('en-IN')}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={{ name: session?.user?.name ?? '', email: userEmail, role }} />

      <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-4 sm:space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {stat('Open', result.counts.open, <AlertCircle size={18} className="text-blue-600" />, 'bg-blue-50')}
          {stat('In Progress', result.counts.in_progress, <Clock size={18} className="text-yellow-600" />, 'bg-yellow-50')}
          {stat('Resolved', result.counts.resolved, <CheckCircle size={18} className="text-green-600" />, 'bg-green-50')}
          {stat('Total', result.baseTotal, <MessageSquare size={18} className="text-gray-500" />, 'bg-gray-50')}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            {role === 'store' ? 'My Assigned Tickets' : 'All Tickets'}
          </h2>
          <TicketTable
            rows={result.rows}
            total={result.total}
            page={result.page}
            pageCount={result.pageCount}
            filters={filters}
            userRole={role}
            cxOptions={cxOptions}
            storeOptions={storeOptions}
            typeOptions={typeOptions}
          />
        </div>
      </main>
    </div>
  )
}
