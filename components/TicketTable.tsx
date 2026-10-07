'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Ticket, TicketStatus, UserRole } from '@/lib/types'
import { QUERY_TYPES } from '@/lib/queryTypes'
import { STAGES, StageKey, isAssigned, stageInfo, stageOf } from '@/lib/workflow'
import { StatusBadge } from './StatusBadge'
import { MessageSquare, Phone, Clock, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatIST } from '@/lib/dateUtils'

type SortKey = 'lastActiveAt' | 'createdAt' | 'contactName' | 'status'

const PAGE_SIZE = 50

const filterClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
const cellSelectClass =
  'w-full max-w-[150px] text-xs text-gray-800 border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

export default function TicketTable({
  initialTickets,
  userRole = 'admin',
  cxNames = [],
  storeNames = [],
}: {
  initialTickets: Ticket[]
  userRole?: UserRole
  cxNames?: string[]
  storeNames?: string[]
}) {
  const canEdit = userRole === 'admin' || userRole === 'executive'
  const [tickets, setTickets] = useState(initialTickets)
  const [filterStatus, setFilterStatus] = useState<TicketStatus | 'all'>('all')
  const [filterQueryType, setFilterQueryType] = useState<string>('all')
  const [filterStage, setFilterStage] = useState<StageKey | 'all'>('all')
  const [filterCx, setFilterCx] = useState<string>('all')
  const [filterStore, setFilterStore] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('lastActiveAt')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [saveError, setSaveError] = useState('')

  // Names already on tickets stay selectable even if that login was since removed.
  const cxOptions = Array.from(new Set([...cxNames, ...tickets.map(t => t.assignedTo).filter(isAssigned)])).sort()
  const storeOptions = Array.from(new Set([...storeNames, ...tickets.map(t => t.storeAssignedTo).filter(Boolean)])).sort()

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const q = search.toLowerCase()
  const filtered = tickets
    .filter(t => filterStatus === 'all' || t.status === filterStatus)
    .filter(t => filterQueryType === 'all' || (filterQueryType === 'none' ? !t.queryType : t.queryType === filterQueryType))
    .filter(t => filterStage === 'all' || stageOf(t) === filterStage)
    .filter(t => filterCx === 'all' || (filterCx === 'Unassigned' ? !isAssigned(t.assignedTo) : t.assignedTo === filterCx))
    .filter(t => filterStore === 'all' || (filterStore === 'none' ? !t.storeAssignedTo : t.storeAssignedTo === filterStore))
    .filter(t =>
      !q ||
      t.contactName.toLowerCase().includes(q) ||
      t.contactPhone.includes(search) ||
      t.ticketId.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  // Rendering every filtered row's DOM nodes at once is what made a large sheet slow.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [search, filterStatus, filterQueryType, filterStage, filterCx, filterStore, sortKey, sortAsc])

  const patch = async (ticketId: string, fields: Partial<Ticket>) => {
    setSaveError('')
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (res.ok) {
      setTickets(ts => ts.map(t => t.ticketId === ticketId ? { ...t, ...fields } : t))
    } else {
      const data = await res.json().catch(() => ({}))
      setSaveError(`${ticketId}: ${data.error ?? 'couldn’t save the change'}`)
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />
      : <span className="w-[14px]" />

  const Pagination = () => (
    totalPages > 1 ? (
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex items-center gap-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    ) : null
  )

  const StageChip = ({ t }: { t: Ticket }) => {
    const s = stageInfo(t)
    return <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
  }

  const QueryTypeCell = ({ t }: { t: Ticket }) =>
    canEdit ? (
      <select value={t.queryType ?? ''} onChange={e => patch(t.ticketId, { queryType: e.target.value })} className={cellSelectClass}>
        <option value="">Select type…</option>
        {QUERY_TYPES.map(qt => <option key={qt} value={qt}>{qt}</option>)}
      </select>
    ) : (
      <span className="text-xs text-gray-700">{t.queryType || <span className="text-gray-400">—</span>}</span>
    )

  const CxCell = ({ t }: { t: Ticket }) =>
    canEdit ? (
      <select value={isAssigned(t.assignedTo) ? t.assignedTo : 'Unassigned'} onChange={e => patch(t.ticketId, { assignedTo: e.target.value })} className={cellSelectClass}>
        <option value="Unassigned">Not taken</option>
        {cxOptions.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    ) : (
      <span className="text-xs text-gray-700">{isAssigned(t.assignedTo) ? t.assignedTo : <span className="text-gray-400">—</span>}</span>
    )

  const StoreCell = ({ t }: { t: Ticket }) =>
    canEdit ? (
      <select value={t.storeAssignedTo ?? ''} onChange={e => patch(t.ticketId, { storeAssignedTo: e.target.value })} className={cellSelectClass}>
        <option value="">Not assigned</option>
        {storeOptions.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    ) : (
      <span className="text-xs text-gray-700">{t.storeAssignedTo || <span className="text-gray-400">—</span>}</span>
    )

  const StatusCell = ({ t }: { t: Ticket }) =>
    canEdit ? (
      <select value={t.status} onChange={e => patch(t.ticketId, { status: e.target.value as TicketStatus })} className={cellSelectClass}>
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <StatusBadge status={t.status} />
    )

  const issueText = (t: Ticket) => t.conversationSummary || t.lastMessage

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search name, phone, ticket ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${filterClass} w-full sm:w-60`}
        />
        <select value={filterStage} onChange={e => setFilterStage(e.target.value as StageKey | 'all')} className={filterClass} aria-label="Stage">
          <option value="all">All stages</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={filterQueryType} onChange={e => setFilterQueryType(e.target.value)} className={filterClass} aria-label="Query type">
          <option value="all">All query types</option>
          <option value="none">No type set</option>
          {QUERY_TYPES.map(qt => <option key={qt} value={qt}>{qt}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as TicketStatus | 'all')} className={filterClass} aria-label="Status">
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {canEdit && (
          <>
            <select value={filterCx} onChange={e => setFilterCx(e.target.value)} className={filterClass} aria-label="CX executive">
              <option value="all">All CX executives</option>
              <option value="Unassigned">Not taken</option>
              {cxOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={filterStore} onChange={e => setFilterStore(e.target.value)} className={filterClass} aria-label="Store executive">
              <option value="all">All store executives</option>
              <option value="none">No store assigned</option>
              {storeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </>
        )}
        <span className="text-sm text-gray-500 ml-auto tabular-nums">{filtered.length} tickets</span>
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 && <div className="py-10 text-center text-gray-400">No tickets found</div>}
        {paged.map(t => (
          <div key={t.ticketId} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 text-sm truncate">{t.contactName}</div>
                <div className="text-gray-400 text-xs">{t.contactPhone.replace(/^91/, '+91 ')} · <span className="font-mono">{t.ticketId}</span></div>
              </div>
              <Link
                href={`/tickets/${t.ticketId}`}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium shrink-0 border border-blue-200 rounded-lg px-2 py-1"
              >
                <MessageSquare size={12} /> View
              </Link>
            </div>
            <div className="text-gray-600 text-sm line-clamp-2">{issueText(t)}</div>
            <div className="flex flex-wrap gap-2 items-center">
              {StageChip({ t })}
              {t.queryType && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{t.queryType}</span>}
              <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                <Clock size={11} />
                {formatIST(t.lastActiveAt, { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
            {canEdit && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-gray-500 space-y-1">Query type{QueryTypeCell({ t })}</label>
                <label className="text-[11px] text-gray-500 space-y-1">Status{StatusCell({ t })}</label>
                <label className="text-[11px] text-gray-500 space-y-1">CX executive{CxCell({ t })}</label>
                <label className="text-[11px] text-gray-500 space-y-1">Store executive{StoreCell({ t })}</label>
              </div>
            )}
          </div>
        ))}
        <Pagination />
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('contactName')}>
                <span className="flex items-center gap-1">Customer <SortIcon k="contactName" /></span>
              </th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Issue</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Query Type</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Stage</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">CX Executive</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Store Executive</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('status')}>
                <span className="flex items-center gap-1">Status <SortIcon k="status" /></span>
              </th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('lastActiveAt')}>
                <span className="flex items-center gap-1 whitespace-nowrap">Last Active <SortIcon k="lastActiveAt" /></span>
              </th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No tickets found</td></tr>
            )}
            {paged.map(t => (
              <tr key={t.ticketId} className="hover:bg-gray-50 transition-colors align-top">
                <td className="px-3 py-3">
                  <div className="font-medium text-gray-900 whitespace-nowrap">{t.contactName}</div>
                  <div className="flex items-center gap-1 text-gray-500 text-xs whitespace-nowrap">
                    <Phone size={10} />
                    {t.contactPhone.replace(/^91/, '+91 ')}
                  </div>
                  <div className="font-mono text-[11px] text-gray-400 mt-0.5">{t.ticketId}</div>
                </td>
                <td className="px-3 py-3 min-w-[220px] max-w-xs">
                  <div className="text-gray-700 text-xs leading-relaxed line-clamp-2" title={issueText(t)}>{issueText(t)}</div>
                </td>
                <td className="px-3 py-3">{QueryTypeCell({ t })}</td>
                <td className="px-3 py-3">{StageChip({ t })}</td>
                <td className="px-3 py-3">{CxCell({ t })}</td>
                <td className="px-3 py-3">{StoreCell({ t })}</td>
                <td className="px-3 py-3">{StatusCell({ t })}</td>
                <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {formatIST(t.lastActiveAt, { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/tickets/${t.ticketId}`} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                    <MessageSquare size={14} /> View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
          <Pagination />
        </div>
      </div>
    </div>
  )
}
