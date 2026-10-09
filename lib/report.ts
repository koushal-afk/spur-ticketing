import { Ticket, TicketStatus } from './types'
import { istDateKey, istToEpoch } from './dateUtils'
import { STAGES, StageKey, isAssigned, stageOf } from './workflow'

const DAY_MS = 24 * 60 * 60 * 1000

// When the ticket was opened. Tickets from before opened_at existed fall back to
// created_at — but that's the WhatsApp chat's start, which for a returning customer can be
// months before this ticket, so it's only trusted when close to the last activity.
export function openedEpoch(t: Ticket): number {
  const opened = istToEpoch(t.openedAt)
  if (opened) return opened
  const created = istToEpoch(t.createdAt)
  const last = istToEpoch(t.lastActiveAt)
  if (created && last && last - created <= 3 * DAY_MS) return created
  return last || created
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + delta * DAY_MS).toISOString().slice(0, 10)
}

type Tally = Record<string, number>
const bump = (t: Tally, k: string) => { t[k] = (t[k] ?? 0) + 1 }
const sorted = (t: Tally) => Object.entries(t).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

export function buildReport(tickets: Ticket[], day: string, trendDays = 14) {
  const openedDay = new Map(tickets.map(t => [t.ticketId, istDateKey(openedEpoch(t))]))
  const resolvedDay = (t: Ticket) => (istToEpoch(t.resolvedAt) ? istDateKey(istToEpoch(t.resolvedAt)) : '')
  const done = (s: TicketStatus) => s === 'resolved' || s === 'closed'

  const opened = tickets.filter(t => openedDay.get(t.ticketId) === day)
  const resolvedToday = tickets.filter(t => resolvedDay(t) === day)

  const statusNow: Record<TicketStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
  const stage: Record<StageKey, number> = { not_taken: 0, needs_store: 0, waiting_store: 0, check_customer: 0, resolved: 0 }
  const byType: Tally = {}
  const cx: Record<string, { taken: number; resolved: number }> = {}
  const store: Record<string, { assigned: number; replied: number }> = {}
  for (const t of opened) {
    statusNow[t.status] = (statusNow[t.status] ?? 0) + 1
    stage[stageOf(t)]++
    bump(byType, t.queryType || 'Not set')
    if (isAssigned(t.assignedTo)) {
      cx[t.assignedTo] ??= { taken: 0, resolved: 0 }
      cx[t.assignedTo].taken++
      if (done(t.status)) cx[t.assignedTo].resolved++
    }
    if (t.storeAssignedTo) {
      store[t.storeAssignedTo] ??= { assigned: 0, replied: 0 }
      store[t.storeAssignedTo].assigned++
      if (t.storeComments?.trim()) store[t.storeAssignedTo].replied++
    }
  }

  // Everything still unresolved right now, regardless of when it opened.
  const backlog = tickets.filter(t => !done(t.status))
  const backlogStage: Record<StageKey, number> = { not_taken: 0, needs_store: 0, waiting_store: 0, check_customer: 0, resolved: 0 }
  for (const t of backlog) backlogStage[stageOf(t)]++

  const trend = Array.from({ length: trendDays }, (_, i) => {
    const d = shiftDay(day, i - trendDays + 1)
    return {
      day: d,
      opened: tickets.filter(t => openedDay.get(t.ticketId) === d).length,
      resolved: tickets.filter(t => resolvedDay(t) === d).length,
    }
  })

  const notTaken = opened
    .filter(t => stageOf(t) === 'not_taken' && !done(t.status))
    .sort((a, b) => openedEpoch(a) - openedEpoch(b))

  const resolutionTracked = tickets.some(t => t.resolvedAt)
  const firstResolvedDay = tickets.map(resolvedDay).filter(Boolean).sort()[0] ?? ''

  return {
    day,
    opened: opened.length,
    resolvedToday: resolvedToday.length,
    stillOpen: opened.filter(t => !done(t.status)).length,
    notTakenCount: notTaken.length,
    statusNow,
    stage: STAGES.map(s => ({ ...s, count: stage[s.key] })),
    byType: sorted(byType),
    cx: Object.entries(cx).sort((a, b) => b[1].taken - a[1].taken),
    store: Object.entries(store).sort((a, b) => b[1].assigned - a[1].assigned),
    backlog: { total: backlog.length, stages: STAGES.filter(s => s.key !== 'resolved').map(s => ({ ...s, count: backlogStage[s.key] })) },
    trend,
    notTaken: notTaken.slice(0, 15),
    resolutionTracked,
    firstResolvedDay,
  }
}

export type Report = ReturnType<typeof buildReport>
