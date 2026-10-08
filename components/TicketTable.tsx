'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Ticket, TicketStatus, UserRole } from '@/lib/types'
import { STAGES, isAssigned, stageInfo } from '@/lib/workflow'
import { TicketFilters } from '@/lib/ticketQuery'
import { StatusBadge } from './StatusBadge'
import { MessageSquare, Phone, Clock, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatIST, istDateKey } from '@/lib/dateUtils'

const filterClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
const cellSelectClass =
  'w-full min-w-[120px] max-w-[160px] text-xs text-gray-800 border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const DAY_MS = 24 * 60 * 60 * 1000
type DatePreset = '' | 'today' | 'yesterday' | '7d' | '30d' | 'custom'

function presetRange(p: DatePreset): { from: string; to: string } {
  const today = istDateKey(Date.now())
  if (p === 'today') return { from: today, to: today }
  if (p === 'yesterday') { const y = istDateKey(Date.now() - DAY_MS); return { from: y, to: y } }
  if (p === '7d') return { from: istDateKey(Date.now() - 6 * DAY_MS), to: today }
  if (p === '30d') return { from: istDateKey(Date.now() - 29 * DAY_MS), to: today }
  return { from: '', to: '' }
}

function presetOf(from: string, to: string): DatePreset {
  if (!from && !to) return ''
  for (const p of ['today', 'yesterday', '7d', '30d'] as DatePreset[]) {
    const r = presetRange(p)
    if (r.from === from && r.to === to) return p
  }
  return 'custom'
}

export default function TicketTable({
  rows: initialRows,
  total,
  page,
  pageCount,
  filters,
  userRole,
  cxOptions,
  storeOptions,
  typeOptions,
}: {
  rows: Ticket[]
  total: number
  page: number
  pageCount: number
  filters: TicketFilters
  userRole: UserRole
  cxOptions: string[]
  storeOptions: string[]
  typeOptions: string[]
}) {
  const canEdit = userRole === 'admin' || userRole === 'executive'
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState(initialRows)
  const [search, setSearch] = useState(filters.q)
  const [datePreset, setDatePreset] = useState<DatePreset>(presetOf(filters.from, filters.to))
  const [saveError, setSaveError] = useState('')

  useEffect(() => setRows(initialRows), [initialRows])

  const go = (updates: Partial<Record<keyof TicketFilters, string | number>>) => {
    const next: Record<string, string> = {
      q: filters.q, status: filters.status, stage: filters.stage, type: filters.type, cx: filters.cx,
      store: filters.store, from: filters.from, to: filters.to, sort: filters.sort, dir: filters.dir,
      page: String(filters.page),
    }
    for (const [k, v] of Object.entries(updates)) next[k] = String(v ?? '')
    if (!('page' in updates)) next.page = '1'
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) {
      if (!v) continue
      if ((k === 'page' && v === '1') || (k === 'sort' && v === 'lastActiveAt') || (k === 'dir' && v === 'desc')) continue
      params.set(k, v)
    }
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  // Debounce typing in the search box.
  const firstSearch = useRef(true)
  useEffect(() => {
    if (firstSearch.current) { firstSearch.current = false; return }
    const t = setTimeout(() => { if (search.trim() !== filters.q) go({ q: search.trim() }) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const onPreset = (p: DatePreset) => {
    setDatePreset(p)
    if (p === 'custom') return
    const r = presetRange(p)
    go({ from: r.from, to: r.to })
  }

  const sortBy = (key: TicketFilters['sort']) => {
    if (filters.sort === key) go({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })
    else go({ sort: key, dir: key === 'contactName' ? 'asc' : 'desc' })
  }

  const patch = async (ticketId: string, fields: Partial<Ticket>) => {
    setSaveError('')
    const before = rows
    setRows(rs => rs.map(t => (t.ticketId === ticketId ? { ...t, ...fields } : t)))
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) {
      setRows(before)
      const data = await res.json().catch(() => ({}))
      setSaveError(`${ticketId}: ${data.error ?? 'couldn’t save the change. Try again.'}`)
    }
  }

  const hasFilters = !!(filters.q || filters.status || filters.stage || filters.type || filters.cx || filters.store || filters.from || filters.to)

  const SortHead = ({ k, label }: { k: TicketFilters['sort']; label: string }) => (
    <th className="px-3 py-3 text-left font-semibold text-gray-600">
      <button onClick={() => sortBy(k)} className="flex items-center gap-1 whitespace-nowrap hover:text-gray-900">
        {label}
        {filters.sort === k ? (filters.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <span className="w-[14px]" />}
      </button>
    </th>
  )

  const stageChip = (t: Ticket) => {
    const s = stageInfo(t)
    return <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
  }

  const cxCell = (t: Ticket) =>
    canEdit ? (
      <select value={isAssigned(t.assignedTo) ? t.assignedTo : 'Unassigned'} onChange={e => patch(t.ticketId, { assignedTo: e.target.value })} className={cellSelectClass} aria-label="CX executive">
        <option value="Unassigned">Not taken</option>
        {cxOptions.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    ) : (
      <span className="text-xs text-gray-700">{isAssigned(t.assignedTo) ? t.assignedTo : <span className="text-gray-400">—</span>}</span>
    )

  const typeCell = (t: Ticket) =>
    canEdit ? (
      <select value={t.queryType ?? ''} onChange={e => patch(t.ticketId, { queryType: e.target.value })} className={cellSelectClass} aria-label="Query type">
        <option value="">Select type…</option>
        {typeOptions.map(qt => <option key={qt} value={qt}>{qt}</option>)}
      </select>
    ) : (
      <span className="text-xs text-gray-700">{t.queryType || <span className="text-gray-400">—</span>}</span>
    )

  const storeCell = (t: Ticket) =>
    canEdit ? (
      <select value={t.storeAssignedTo ?? ''} onChange={e => patch(t.ticketId, { storeAssignedTo: e.target.value })} className={cellSelectClass} aria-label="Store executive">
        <option value="">Not assigned</option>
        {storeOptions.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    ) : (
      <span className="text-xs text-gray-700">{t.storeAssignedTo || <span className="text-gray-400">—</span>}</span>
    )

  const statusCell = (t: Ticket) =>
    canEdit ? (
      <select value={t.status} onChange={e => patch(t.ticketId, { status: e.target.value as TicketStatus })} className={cellSelectClass} aria-label="Status">
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <StatusBadge status={t.status} />
    )

  const issueText = (t: Ticket) => t.conversationSummary || t.lastMessage
  const href = (t: Ticket) => `/tickets/${t.ticketId}`

  const pagination = pageCount > 1 && (
    <div className="flex items-center justify-between pt-1">
      <span className="text-xs text-gray-500 tabular-nums">Page {page} of {pageCount}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => go({ page: page - 1 })}
          disabled={page <= 1 || isPending}
          className="flex items-center gap-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          onClick={() => go({ page: page + 1 })}
          disabled={page >= pageCount || isPending}
          className="flex items-center gap-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Search name, phone, ticket ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${filterClass} w-full sm:w-56`}
          aria-label="Search"
        />
        <select value={datePreset} onChange={e => onPreset(e.target.value as DatePreset)} className={filterClass} aria-label="Date">
          <option value="">Any date</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="custom">Custom range…</option>
        </select>
        {datePreset === 'custom' && (
          <span className="flex items-center gap-1">
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={e => go({ from: e.target.value })} className={filterClass} aria-label="From date" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={e => go({ to: e.target.value })} className={filterClass} aria-label="To date" />
          </span>
        )}
        {canEdit && (
          <select value={filters.cx} onChange={e => go({ cx: e.target.value })} className={filterClass} aria-label="CX executive">
            <option value="">All CX executives</option>
            <option value="Unassigned">Not taken</option>
            {cxOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <select value={filters.type} onChange={e => go({ type: e.target.value })} className={filterClass} aria-label="Query type">
          <option value="">All query types</option>
          <option value="none">No type set</option>
          {typeOptions.map(qt => <option key={qt} value={qt}>{qt}</option>)}
        </select>
        {canEdit && (
          <select value={filters.store} onChange={e => go({ store: e.target.value })} className={filterClass} aria-label="Store executive">
            <option value="">All store executives</option>
            <option value="none">No store assigned</option>
            {storeOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <select value={filters.status} onChange={e => go({ status: e.target.value })} className={filterClass} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filters.stage} onChange={e => go({ stage: e.target.value })} className={filterClass} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setDatePreset(''); startTransition(() => router.replace(pathname, { scroll: false })) }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 py-2"
          >
            <X size={14} /> Clear filters
          </button>
        )}
        <span className="text-sm text-gray-500 ml-auto tabular-nums">
          {isPending ? 'Loading…' : `${total.toLocaleString('en-IN')} tickets`}
        </span>
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {/* Mobile cards */}
        <div className="sm:hidden space-y-3">
          {rows.length === 0 && <div className="py-10 text-center text-gray-400">No tickets match these filters</div>}
          {rows.map(t => (
            <div key={t.ticketId} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={href(t)} className="min-w-0 group">
                  <div className="font-medium text-gray-900 text-sm truncate group-hover:text-blue-700 group-hover:underline">{t.contactName}</div>
                  <div className="text-gray-400 text-xs">{t.contactPhone.replace(/^91/, '+91 ')} · <span className="font-mono">{t.ticketId}</span></div>
                </Link>
                {stageChip(t)}
              </div>
              <div className="text-gray-600 text-sm line-clamp-2">{issueText(t)}</div>
              {canEdit ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-gray-500 space-y-1">CX executive{cxCell(t)}</label>
                  <label className="text-[11px] text-gray-500 space-y-1">Query type{typeCell(t)}</label>
                  <label className="text-[11px] text-gray-500 space-y-1">Store executive{storeCell(t)}</label>
                  <label className="text-[11px] text-gray-500 space-y-1">Status{statusCell(t)}</label>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 items-center">
                  <StatusBadge status={t.status} />
                  {t.queryType && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{t.queryType}</span>}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock size={11} /> {formatIST(t.lastActiveAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <Link href={href(t)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium border border-blue-200 rounded-lg px-2 py-1">
                  <MessageSquare size={12} /> View
                </Link>
              </div>
            </div>
          ))}
          {pagination}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <SortHead k="contactName" label="Customer" />
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Issue</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">CX Executive</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Query Type</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Store Executive</th>
                <SortHead k="status" label="Status" />
                <SortHead k="lastActiveAt" label="Last Active (IST)" />
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Stage</th>
                <th className="px-3 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No tickets match these filters</td></tr>
              )}
              {rows.map(t => (
                <tr key={t.ticketId} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-3 py-3">
                    <Link href={href(t)} className="group block">
                      <div className="font-medium text-gray-900 whitespace-nowrap group-hover:text-blue-700 group-hover:underline">{t.contactName}</div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs whitespace-nowrap group-hover:text-blue-600">
                        <Phone size={10} />
                        {t.contactPhone.replace(/^91/, '+91 ')}
                      </div>
                    </Link>
                    <div className="font-mono text-[11px] text-gray-400 mt-0.5">{t.ticketId}</div>
                  </td>
                  <td className="px-3 py-3 min-w-[220px] max-w-xs">
                    <div className="text-gray-700 text-xs leading-relaxed line-clamp-2" title={issueText(t)}>{issueText(t)}</div>
                  </td>
                  <td className="px-3 py-3">{cxCell(t)}</td>
                  <td className="px-3 py-3">{typeCell(t)}</td>
                  <td className="px-3 py-3">{storeCell(t)}</td>
                  <td className="px-3 py-3">{statusCell(t)}</td>
                  <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap tabular-nums">
                    {formatIST(t.lastActiveAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-3">{stageChip(t)}</td>
                  <td className="px-3 py-3">
                    <Link href={href(t)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                      <MessageSquare size={14} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 && <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">{pagination}</div>}
        </div>
      </div>
    </div>
  )
}
