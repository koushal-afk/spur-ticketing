'use client'
import { TicketStatus, TicketPriority } from '@/lib/types'

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-orange-100 text-orange-700',
  high: 'bg-red-100 text-red-700',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  )
}
