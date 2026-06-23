'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Ticket, TicketStatus, TicketPriority } from '@/lib/types'
import { TEAM_MEMBERS, UNASSIGNED } from '@/lib/team'
import { StatusBadge, PriorityBadge } from './StatusBadge'
import { MessageSquare, Phone, Clock, User, ChevronUp, ChevronDown } from 'lucide-react'

type SortKey = 'lastActiveAt' | 'createdAt' | 'contactName' | 'status' | 'priority'

export default function TicketTable({ initialTickets }: { initialTickets: Ticket[] }) {
  const [tickets, setTickets] = useState(initialTickets)
  const [filterStatus, setFilterStatus] = useState<TicketStatus | 'all'>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<TicketPriority | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('lastActiveAt')
  const [sortAsc, setSortAsc] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const filtered = tickets
    .filter(t => filterStatus === 'all' || t.status === filterStatus)
    .filter(t => filterAssignee === 'all' || t.assignedTo === filterAssignee)
    .filter(t => filterPriority === 'all' || t.priority === filterPriority)
    .filter(t =>
      !search ||
      t.contactName.toLowerCase().includes(search.toLowerCase()) ||
      t.contactPhone.includes(search) ||
      t.ticketId.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />
      : <span className="w-[14px]" />

  const handleQuickAssign = async (ticketId: string, assignedTo: string) => {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo }),
    })
    if (res.ok) {
      setTickets(ts => ts.map(t => t.ticketId === ticketId ? { ...t, assignedTo } : t))
    }
  }

  const handleQuickStatus = async (ticketId: string, status: TicketStatus) => {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setTickets(ts => ts.map(t => t.ticketId === ticketId ? { ...t, status } : t))
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search name, phone, ticket ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as TicketStatus | 'all')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Assignees</option>
          <option value="Unassigned">Unassigned</option>
          {TEAM_MEMBERS.map(m => (
            <option key={m.email} value={m.name}>{m.name}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as TicketPriority | 'all')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} tickets</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Ticket</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('contactName')}>
                <span className="flex items-center gap-1">Contact <SortIcon k="contactName" /></span>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Last Message</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('status')}>
                <span className="flex items-center gap-1">Status <SortIcon k="status" /></span>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('priority')}>
                <span className="flex items-center gap-1">Priority <SortIcon k="priority" /></span>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Assigned To</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('lastActiveAt')}>
                <span className="flex items-center gap-1">Last Active <SortIcon k="lastActiveAt" /></span>
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">No tickets found</td>
              </tr>
            )}
            {filtered.map(ticket => (
              <tr key={ticket.ticketId} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-gray-500">{ticket.ticketId}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">
                      {ticket.contactName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{ticket.contactName}</div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs">
                        <Phone size={10} />
                        {ticket.contactPhone.replace(/^91/, '+91 ')}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <div className="text-gray-700 truncate">{ticket.lastMessage}</div>
                  {ticket.conversationSummary && (
                    <div className="text-gray-400 text-xs truncate mt-0.5">{ticket.conversationSummary}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={ticket.status}
                    onChange={e => handleQuickStatus(ticket.ticketId, e.target.value as TicketStatus)}
                    className="text-xs border-0 bg-transparent cursor-pointer focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={ticket.assignedTo}
                    onChange={e => handleQuickAssign(ticket.ticketId, e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="Unassigned">Unassigned</option>
                    {TEAM_MEMBERS.map(m => (
                      <option key={m.email} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    {ticket.lastActiveAt ? new Date(ticket.lastActiveAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/tickets/${ticket.ticketId}`}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    <MessageSquare size={14} />
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
