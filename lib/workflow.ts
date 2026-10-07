import { Ticket } from './types'

export type StageKey = 'not_taken' | 'needs_store' | 'waiting_store' | 'check_customer' | 'resolved'

export const STAGES: { key: StageKey; label: string; className: string }[] = [
  { key: 'not_taken', label: 'Not taken up', className: 'bg-gray-100 text-gray-700' },
  { key: 'needs_store', label: 'Needs store', className: 'bg-blue-100 text-blue-800' },
  { key: 'waiting_store', label: 'Waiting on store', className: 'bg-amber-100 text-amber-800' },
  { key: 'check_customer', label: 'Check with customer', className: 'bg-purple-100 text-purple-800' },
  { key: 'resolved', label: 'Resolution logged', className: 'bg-green-100 text-green-800' },
]

export function isAssigned(name: string | undefined) {
  return !!name && name !== 'Unassigned'
}

// Where a ticket currently sits in the CX → store → customer workflow.
export function stageOf(t: Ticket): StageKey {
  if (t.finalResolutionComments?.trim()) return 'resolved'
  if (!isAssigned(t.assignedTo)) return 'not_taken'
  if (!t.storeAssignedTo) return 'needs_store'
  if (!t.storeComments?.trim()) return 'waiting_store'
  return 'check_customer'
}

export function stageInfo(t: Ticket) {
  const key = stageOf(t)
  return STAGES.find(s => s.key === key)!
}
