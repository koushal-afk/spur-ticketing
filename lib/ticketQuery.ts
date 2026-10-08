import { Ticket, TicketStatus } from './types'
import { StageKey, isAssigned, stageOf } from './workflow'
import { istDateKey, istToEpoch } from './dateUtils'

export const PAGE_SIZE = 50

export type TicketFilters = {
  q: string
  status: TicketStatus | ''
  stage: StageKey | ''
  type: string // '' = any, 'none' = no type set
  cx: string // '' = any, 'Unassigned' = not taken
  store: string // '' = any, 'none' = no store
  from: string // IST date YYYY-MM-DD, on last customer activity
  to: string
  sort: 'lastActiveAt' | 'contactName' | 'status'
  dir: 'asc' | 'desc'
  page: number
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

export function parseFilters(sp: Record<string, string | string[] | undefined>): TicketFilters {
  const sort = one(sp.sort)
  return {
    q: one(sp.q).trim(),
    status: (['open', 'in_progress', 'resolved', 'closed'].includes(one(sp.status)) ? one(sp.status) : '') as TicketStatus | '',
    stage: (['not_taken', 'needs_store', 'waiting_store', 'check_customer', 'resolved'].includes(one(sp.stage)) ? one(sp.stage) : '') as StageKey | '',
    type: one(sp.type),
    cx: one(sp.cx),
    store: one(sp.store),
    from: isDate(one(sp.from)) ? one(sp.from) : '',
    to: isDate(one(sp.to)) ? one(sp.to) : '',
    sort: sort === 'contactName' || sort === 'status' ? sort : 'lastActiveAt',
    dir: one(sp.dir) === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(one(sp.page), 10) || 1),
  }
}

// Everything except status, so the status counts above the list follow the other filters.
function matchesExceptStatus(t: Ticket, f: TicketFilters): boolean {
  if (f.stage && stageOf(t) !== f.stage) return false
  if (f.type && (f.type === 'none' ? !!t.queryType : t.queryType !== f.type)) return false
  if (f.cx && (f.cx === 'Unassigned' ? isAssigned(t.assignedTo) : t.assignedTo !== f.cx)) return false
  if (f.store && (f.store === 'none' ? !!t.storeAssignedTo : t.storeAssignedTo !== f.store)) return false
  if (f.from || f.to) {
    const ms = istToEpoch(t.lastActiveAt) || istToEpoch(t.createdAt)
    if (!ms) return false
    const day = istDateKey(ms)
    if (f.from && day < f.from) return false
    if (f.to && day > f.to) return false
  }
  if (f.q) {
    const q = f.q.toLowerCase()
    if (!t.contactName.toLowerCase().includes(q) && !t.contactPhone.includes(f.q) && !t.ticketId.toLowerCase().includes(q)) return false
  }
  return true
}

export function queryTickets(all: Ticket[], f: TicketFilters) {
  const base = all.filter(t => matchesExceptStatus(t, f))
  const counts: Record<TicketStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
  for (const t of base) counts[t.status] = (counts[t.status] ?? 0) + 1

  const filtered = f.status ? base.filter(t => t.status === f.status) : base
  const key = (t: Ticket): string | number =>
    f.sort === 'lastActiveAt' ? istToEpoch(t.lastActiveAt) : f.sort === 'contactName' ? t.contactName.toLowerCase() : t.status
  const sorted = [...filtered].sort((a, b) => {
    const ka = key(a), kb = key(b)
    const c = ka < kb ? -1 : ka > kb ? 1 : 0
    return f.dir === 'asc' ? c : -c
  })

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(f.page, pageCount)
  return {
    rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: sorted.length,
    page,
    pageCount,
    counts,
    baseTotal: base.length,
  }
}
