import { getAllTickets } from '@/lib/sheets'
import TicketTable from '@/components/TicketTable'
import { TicketStatus } from '@/lib/types'
import { MessageSquare, CheckCircle, Clock, AlertCircle } from 'lucide-react'

export const revalidate = 30

async function getStats(tickets: Awaited<ReturnType<typeof getAllTickets>>) {
  const counts: Record<TicketStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
  for (const t of tickets) counts[t.status] = (counts[t.status] ?? 0) + 1
  return counts
}

export default async function HomePage() {
  const tickets = await getAllTickets()
  const stats = await getStats(tickets)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <MessageSquare size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">SuperK Support</h1>
              <p className="text-xs text-gray-500">WhatsApp Ticket Management</p>
            </div>
          </div>
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700">↻ Refresh</a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <AlertCircle size={20} className="text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.open}</div>
              <div className="text-xs text-gray-500">Open</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
              <Clock size={20} className="text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.in_progress}</div>
              <div className="text-xs text-gray-500">In Progress</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.resolved}</div>
              <div className="text-xs text-gray-500">Resolved</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
              <MessageSquare size={20} className="text-gray-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{tickets.length}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">All Tickets</h2>
          <TicketTable initialTickets={tickets} />
        </div>
      </main>
    </div>
  )
}
