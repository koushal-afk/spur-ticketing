'use client'
import { useState } from 'react'
import { Ticket, TicketStatus, TicketPriority, UserRole } from '@/lib/types'
import { TEAM_MEMBERS } from '@/lib/team'
import { StatusBadge, PriorityBadge } from './StatusBadge'
import { ArrowLeft, Phone, MessageSquare, User, Calendar, Clock, FileText, Save, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function TicketDetail({ ticket: initial, userRole }: { ticket: Ticket; userRole: UserRole }) {
  const [ticket, setTicket] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [comment, setComment] = useState(initial.conversationSummary ?? '')
  const [commentSaving, setCommentSaving] = useState(false)
  const [commentSaved, setCommentSaved] = useState(false)

  const canEdit = userRole === 'admin' || userRole === 'executive'
  const canClose = userRole === 'admin' || userRole === 'executive' || userRole === 'employee'

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

  const saveComment = async () => {
    setCommentSaving(true)
    const res = await fetch(`/api/tickets/${ticket.ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationSummary: comment }),
    })
    if (res.ok) {
      const data = await res.json()
      setTicket(data.ticket)
      setCommentSaved(true)
      setTimeout(() => setCommentSaved(false), 2000)
    }
    setCommentSaving(false)
  }

  const closeTicket = () => update({ status: 'closed' })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm">
            <ArrowLeft size={16} /> Back
          </Link>
          <div className="h-4 w-px bg-gray-200 hidden sm:block" />
          <span className="font-mono text-xs sm:text-sm text-gray-500">{ticket.ticketId}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {canClose && ticket.status !== 'closed' && (
            <button
              onClick={closeTicket}
              disabled={saving}
              className="ml-auto flex items-center gap-1.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle size={14} /> Close
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-6 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
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
            </div>
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare size={16} /> Conversation
            </h3>
            <div className="space-y-3">
              <MessageBubble text={ticket.firstMessage} label="First Message" time={ticket.createdAt} isFirst />
              {ticket.lastMessage && ticket.lastMessage !== ticket.firstMessage && (
                <>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span>Latest</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <MessageBubble text={ticket.lastMessage} label="Last Message" time={ticket.lastActiveAt} />
                </>
              )}
            </div>
          </div>

          {/* Executive Comments */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <FileText size={16} /> Executive Comments
            </h3>
            {canEdit ? (
              <div className="space-y-2">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={4}
                  placeholder="Add instructions or comments for the assigned employee..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveComment}
                    disabled={commentSaving}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Save size={13} />
                    {commentSaving ? 'Saving…' : 'Save Comment'}
                  </button>
                  {commentSaved && <span className="text-green-600 text-sm">✓ Saved</span>}
                </div>
              </div>
            ) : (
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                {ticket.conversationSummary || <span className="text-gray-400 italic">No comments yet.</span>}
              </p>
            )}
          </div>
        </div>

        {/* Right: controls */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <h3 className="font-semibold text-gray-900">Ticket Details</h3>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              {canEdit ? (
                <select
                  value={ticket.status}
                  onChange={e => update({ status: e.target.value as TicketStatus })}
                  disabled={saving}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              ) : (
                <StatusBadge status={ticket.status} />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Priority</label>
              <PriorityBadge priority={ticket.priority} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Assigned To</label>
              {canEdit ? (
                <select
                  value={ticket.assignedTo}
                  onChange={e => update({ assignedTo: e.target.value })}
                  disabled={saving}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Unassigned">Unassigned</option>
                  {TEAM_MEMBERS.map(m => (
                    <option key={m.email} value={m.name}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-700">{ticket.assignedTo}</span>
              )}
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
                  {ticket.createdAt ? new Date(Number(ticket.createdAt) * 1000).toLocaleString('en-IN') : '—'}
                </div>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <Clock size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-400">Last Active</div>
                  {ticket.lastActiveAt ? new Date(Number(ticket.lastActiveAt) * 1000).toLocaleString('en-IN') : '—'}
                </div>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <User size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-400">Last Updated</div>
                  {ticket.updatedAt ? new Date(Number(ticket.updatedAt) * 1000).toLocaleString('en-IN') : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function MessageBubble({ text, label, time, isFirst }: { text: string; label: string; time: string; isFirst?: boolean }) {
  return (
    <div className={`flex gap-3 ${isFirst ? '' : 'flex-row-reverse'}`}>
      <div className={`max-w-sm rounded-2xl px-4 py-3 text-sm ${isFirst ? 'bg-gray-100 text-gray-800 rounded-tl-sm' : 'bg-green-500 text-white rounded-tr-sm'}`}>
        <p>{text}</p>
        <p className={`text-xs mt-1 ${isFirst ? 'text-gray-400' : 'text-green-100'}`}>
          {time ? new Date(Number(time) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}
        </p>
      </div>
    </div>
  )
}
