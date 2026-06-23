'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ticket, TicketStatus, TicketPriority } from '@/lib/types'
import { TEAM_MEMBERS } from '@/lib/team'
import { StatusBadge, PriorityBadge } from './StatusBadge'
import { ArrowLeft, Phone, MessageSquare, User, Calendar, Clock, FileText } from 'lucide-react'
import Link from 'next/link'

export default function TicketDetail({ ticket: initial }: { ticket: Ticket }) {
  const [ticket, setTicket] = useState(initial)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const update = async (fields: Partial<Ticket>) => {
    setSaving(true)
    const res = await fetch(`/api/tickets/${ticket.ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (res.ok) {
      const data = await res.json()
      setTicket(data.ticket)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
            <ArrowLeft size={16} /> Back to Tickets
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <span className="font-mono text-sm text-gray-500">{ticket.ticketId}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-3 gap-6">
        {/* Left: conversation info */}
        <div className="col-span-2 space-y-4">
          {/* Contact card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-lg">
                {ticket.contactName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{ticket.contactName}</h2>
                <div className="flex items-center gap-1 text-gray-500 text-sm mt-1">
                  <Phone size={13} />
                  <a href={`tel:+${ticket.contactPhone}`} className="hover:underline">
                    {ticket.contactPhone.replace(/^91/, '+91 ')}
                  </a>
                </div>
              </div>
              <div className="ml-auto">
                <a
                  href={`https://wa.me/${ticket.contactPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <MessageSquare size={14} />
                  Open in WhatsApp
                </a>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare size={16} /> Conversation
            </h3>
            <div className="space-y-3">
              <MessageBubble
                text={ticket.firstMessage}
                label="First Message"
                time={ticket.createdAt}
                isFirst
              />
              {ticket.lastMessage && ticket.lastMessage !== ticket.firstMessage && (
                <>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span>Latest</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <MessageBubble
                    text={ticket.lastMessage}
                    label="Last Message"
                    time={ticket.lastActiveAt}
                  />
                </>
              )}
            </div>
          </div>

          {/* Summary */}
          {ticket.conversationSummary && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <FileText size={16} /> AI Summary
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">{ticket.conversationSummary}</p>
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <h3 className="font-semibold text-gray-900">Ticket Details</h3>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select
                value={ticket.status}
                onChange={e => update({ status: e.target.value as TicketStatus })}
                disabled={saving}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Priority</label>
              <select
                value={ticket.priority}
                onChange={e => update({ priority: e.target.value as TicketPriority })}
                disabled={saving}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Assigned To</label>
              <select
                value={ticket.assignedTo}
                onChange={e => update({ assignedTo: e.target.value })}
                disabled={saving}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Unassigned">Unassigned</option>
                {TEAM_MEMBERS.map(m => (
                  <option key={m.email} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>

            {saving && <p className="text-xs text-blue-500">Saving...</p>}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 text-gray-600">
                <Calendar size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-400">Created</div>
                  {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('en-IN') : '—'}
                </div>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <Clock size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-400">Last Active</div>
                  {ticket.lastActiveAt ? new Date(ticket.lastActiveAt).toLocaleString('en-IN') : '—'}
                </div>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <User size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-400">Last Updated</div>
                  {ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString('en-IN') : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function MessageBubble({ text, label, time, isFirst }: {
  text: string
  label: string
  time: string
  isFirst?: boolean
}) {
  return (
    <div className={`flex gap-3 ${isFirst ? '' : 'flex-row-reverse'}`}>
      <div className={`max-w-sm rounded-2xl px-4 py-3 text-sm ${
        isFirst
          ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
          : 'bg-green-500 text-white rounded-tr-sm'
      }`}>
        <p>{text}</p>
        <p className={`text-xs mt-1 ${isFirst ? 'text-gray-400' : 'text-green-100'}`}>
          {time ? new Date(time).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}
        </p>
      </div>
    </div>
  )
}
