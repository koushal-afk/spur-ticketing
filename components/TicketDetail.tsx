'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ticket, TicketStatus, UserRole, AppUser } from '@/lib/types'
import { isAssigned, stageInfo } from '@/lib/workflow'
import { StatusBadge } from './StatusBadge'
import {
  ArrowLeft, Phone, MessageSquare, User, Calendar, Clock, Save, ListChecks, Sparkles, Lock, Check, CircleCheck, AlertCircle,
} from 'lucide-react'
import { formatIST } from '@/lib/dateUtils'

const selectClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400'
const textareaClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none'

export default function TicketDetail({
  ticket: initial,
  userRole,
  userName,
  storeUsers,
  cxUsers,
  queryTypes,
}: {
  ticket: Ticket
  userRole: UserRole
  userName: string
  storeUsers: AppUser[]
  cxUsers: AppUser[]
  queryTypes: string[]
}) {
  const router = useRouter()
  const [ticket, setTicket] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  // Comment boxes with typed-but-unsaved text, so leaving the page can warn first.
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const hasUnsaved = Object.values(dirty).some(Boolean)
  const markDirty = useCallback((key: string, d: boolean) => setDirty(prev => (prev[key] === d ? prev : { ...prev, [key]: d })), [])

  useEffect(() => {
    if (!hasUnsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  const leave = () => {
    if (hasUnsaved && !window.confirm('You have comments that aren’t saved yet. Leave without saving them?')) return
    // Go back to the list as it was (with its filters) when we came from it.
    if (typeof document !== 'undefined' && document.referrer.startsWith(window.location.origin)) router.back()
    else router.push('/')
  }

  const canEdit = userRole === 'admin' || userRole === 'executive'
  const canEditStoreComment = canEdit || (userRole === 'store' && ticket.storeAssignedTo === userName)
  const taken = isAssigned(ticket.assignedTo)
  // CX has to take the ticket before working the later steps.
  const cxLocked = canEdit && !taken

  const update = async (fields: Partial<Ticket>) => {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/tickets/${ticket.ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setTicket(data.ticket); setLastSavedAt(Date.now()) }
    else setError(data.error ?? 'Couldn’t save. Check your connection and try again.')
    setSaving(false)
    return res.ok
  }

  const takeTicket = () =>
    update({ assignedTo: userName, ...(ticket.status === 'open' ? { status: 'in_progress' as TicketStatus } : {}) })

  // Include the current value even if that person no longer has a login, so the select doesn't blank it.
  const cxOptions = Array.from(new Set([...cxUsers.map(u => u.name), ...(taken ? [ticket.assignedTo] : [])]))
  const storeOptions = Array.from(new Set([...storeUsers.map(u => u.name), ...(ticket.storeAssignedTo ? [ticket.storeAssignedTo] : [])]))
  const typeOptions = Array.from(new Set([...queryTypes, ...(ticket.queryType ? [ticket.queryType] : [])]))
  const stage = stageInfo(ticket)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3">
          <button onClick={leave} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Tickets
          </button>
          <div className="h-4 w-px bg-gray-200 hidden sm:block" />
          <span className="font-mono text-xs sm:text-sm text-gray-500">{ticket.ticketId}</span>
          {canEdit ? (
            <select
              value={ticket.status}
              onChange={e => update({ status: e.target.value as TicketStatus })}
              disabled={saving}
              aria-label="Status"
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          ) : (
            <StatusBadge status={ticket.status} />
          )}
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stage.className}`}>
            {stage.label}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <SaveState saving={saving} error={!!error} unsaved={hasUnsaved} lastSavedAt={lastSavedAt} />
            <button
              onClick={leave}
              className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-6 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="sm:col-span-2 space-y-4">
          {/* Contact */}
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

          {/* Chat Summary (AI-generated from the WhatsApp conversation) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Sparkles size={16} /> Chat Summary
              <span className="text-[11px] font-normal text-gray-400">AI-generated</span>
            </h3>
            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
              {ticket.conversationSummary || <span className="text-gray-400 italic">No summary yet.</span>}
            </p>
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare size={16} /> Conversation
            </h3>
            <div className="space-y-3">
              <MessageBubble text={ticket.firstMessage} time={ticket.createdAt} isFirst />
              {ticket.lastMessage && ticket.lastMessage !== ticket.firstMessage && (
                <>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span>Latest</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <MessageBubble text={ticket.lastMessage} time={ticket.lastActiveAt} />
                </>
              )}
            </div>
          </div>

          {/* Resolution Workflow */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <ListChecks size={16} /> Resolution Workflow
            </h3>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <ol className="space-y-0">
              <Step n={1} title="Customer service executive" done={taken}>
                {canEdit && !taken ? (
                  <button
                    onClick={takeTicket}
                    disabled={saving || !userName}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                  >
                    Take this ticket
                  </button>
                ) : canEdit ? (
                  <select
                    value={ticket.assignedTo}
                    onChange={e => update({ assignedTo: e.target.value })}
                    disabled={saving}
                    className={selectClass}
                  >
                    <option value="Unassigned">Unassigned</option>
                    {cxOptions.map(n => <option key={n} value={n}>{n}{n === userName ? ' (you)' : ''}</option>)}
                  </select>
                ) : (
                  <ReadOnly value={taken ? ticket.assignedTo : ''} empty="Not taken up yet" />
                )}
              </Step>

              <Step n={2} title="Type of query" done={!!ticket.queryType} locked={cxLocked}>
                {canEdit ? (
                  <select
                    value={ticket.queryType ?? ''}
                    onChange={e => update({ queryType: e.target.value })}
                    disabled={saving || cxLocked}
                    className={selectClass}
                  >
                    <option value="">Select type…</option>
                    {typeOptions.map(qt => <option key={qt} value={qt}>{qt}</option>)}
                  </select>
                ) : (
                  <ReadOnly value={ticket.queryType} empty="Not set" />
                )}
              </Step>

              <Step n={3} title="Store executive" done={!!ticket.storeAssignedTo} locked={cxLocked}>
                {canEdit ? (
                  <select
                    value={ticket.storeAssignedTo ?? ''}
                    onChange={e => update({ storeAssignedTo: e.target.value })}
                    disabled={saving || cxLocked}
                    className={selectClass}
                  >
                    <option value="">Not assigned</option>
                    {storeOptions.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <ReadOnly value={ticket.storeAssignedTo} empty="Not assigned" />
                )}
              </Step>

              <Step n={4} title="Customer service executive comments" done={!!ticket.employeeComment?.trim()} locked={cxLocked}>
                <CommentField
                  dirtyKey="cx"
                  onDirty={markDirty}
                  key={`cx-${ticket.employeeComment}`}
                  initial={ticket.employeeComment ?? ''}
                  editable={canEdit && !cxLocked}
                  placeholder="What the customer reported and what you’ve asked the store to check"
                  empty="No comments yet"
                  buttonLabel="Save comments"
                  onSave={v => update({ employeeComment: v })}
                />
              </Step>

              <Step n={5} title="Store executive comments" done={!!ticket.storeComments?.trim()} locked={cxLocked && !ticket.storeComments}>
                <CommentField
                  dirtyKey="store"
                  onDirty={markDirty}
                  key={`store-${ticket.storeComments}`}
                  initial={ticket.storeComments ?? ''}
                  editable={canEditStoreComment && !cxLocked}
                  placeholder="What the store found or did about this"
                  empty={ticket.storeAssignedTo ? `Waiting on ${ticket.storeAssignedTo}` : 'Waiting on store executive'}
                  buttonLabel="Save store comments"
                  onSave={v => update({ storeComments: v })}
                />
              </Step>

              <Step n={6} title="Final resolution" hint="After checking back with the customer" done={!!ticket.finalResolutionComments?.trim()} locked={cxLocked} last>
                <CommentField
                  dirtyKey="final"
                  onDirty={markDirty}
                  key={`final-${ticket.finalResolutionComments}`}
                  initial={ticket.finalResolutionComments ?? ''}
                  editable={canEdit && !cxLocked}
                  placeholder="How this was resolved with the customer"
                  empty="Not resolved with customer yet"
                  buttonLabel={ticket.status === 'resolved' || ticket.status === 'closed' ? 'Save resolution' : 'Save & mark resolved'}
                  onSave={v => update({
                    finalResolutionComments: v,
                    ...(v.trim() && ticket.status !== 'resolved' && ticket.status !== 'closed' ? { status: 'resolved' as TicketStatus } : {}),
                  })}
                />
              </Step>
            </ol>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Timeline</h3>
            <div className="space-y-2 text-sm">
              <TimelineRow icon={<Calendar size={14} />} label="Created" value={formatIST(ticket.createdAt)} />
              <TimelineRow icon={<Clock size={14} />} label="Last customer activity" value={formatIST(ticket.lastActiveAt)} />
              <TimelineRow icon={<User size={14} />} label="Last updated" value={formatIST(ticket.updatedAt)} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Step({
  n, title, hint, done, locked, last, children,
}: {
  n: number; title: string; hint?: string; done: boolean; locked?: boolean; last?: boolean; children: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
            done ? 'bg-green-600 text-white' : locked ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
          }`}
        >
          {done ? <Check size={14} /> : locked ? <Lock size={12} /> : n}
        </div>
        {!last && <div className="w-px flex-1 bg-gray-200 my-1" />}
      </div>
      <div className={`flex-1 min-w-0 ${last ? '' : 'pb-5'}`}>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className={`text-sm font-medium ${locked ? 'text-gray-400' : 'text-gray-900'}`}>{title}</span>
          {hint && <span className="text-xs text-gray-400">{hint}</span>}
        </div>
        {locked && <p className="text-xs text-gray-400 mb-1.5">Take this ticket first</p>}
        {children}
      </div>
    </li>
  )
}

function CommentField({
  initial, editable, placeholder, empty, buttonLabel, onSave, dirtyKey, onDirty,
}: {
  initial: string; editable: boolean; placeholder: string; empty: string; buttonLabel: string
  onSave: (v: string) => Promise<boolean>; dirtyKey: string; onDirty: (key: string, dirty: boolean) => void
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const isDirty = editable && value !== initial
  useEffect(() => { onDirty(dirtyKey, isDirty) }, [dirtyKey, isDirty, onDirty])
  useEffect(() => () => onDirty(dirtyKey, false), [dirtyKey, onDirty])

  if (!editable) {
    return <ReadOnly value={initial} empty={empty} multiline />
  }

  const save = async () => {
    setBusy(true)
    const ok = await onSave(value)
    setBusy(false)
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  return (
    <div className="space-y-2">
      <textarea value={value} onChange={e => setValue(e.target.value)} rows={3} placeholder={placeholder} className={textareaClass} />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy || value === initial}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Save size={13} />
          {busy ? 'Saving…' : buttonLabel}
        </button>
        {saved && <span className="text-green-600 text-sm">Saved</span>}
      </div>
    </div>
  )
}

function ReadOnly({ value, empty, multiline }: { value?: string; empty: string; multiline?: boolean }) {
  return value?.trim() ? (
    <p className={`text-sm text-gray-700 ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>{value}</p>
  ) : (
    <p className="text-sm text-gray-400 italic">{empty}</p>
  )
}

function TimelineRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-gray-600">
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <div>
        <div className="text-xs text-gray-400">{label}</div>
        {value}
      </div>
    </div>
  )
}

function MessageBubble({ text, time, isFirst }: { text: string; time: string; isFirst?: boolean }) {
  return (
    <div className={`flex gap-3 ${isFirst ? '' : 'flex-row-reverse'}`}>
      <div className={`max-w-sm rounded-2xl px-4 py-3 text-sm ${isFirst ? 'bg-gray-100 text-gray-800 rounded-tl-sm' : 'bg-green-500 text-white rounded-tr-sm'}`}>
        <p>{text}</p>
        <p className={`text-xs mt-1 ${isFirst ? 'text-gray-400' : 'text-green-100'}`}>
          {formatIST(time, { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
    </div>
  )
}

function SaveState({ saving, error, unsaved, lastSavedAt }: { saving: boolean; error: boolean; unsaved: boolean; lastSavedAt: number | null }) {
  if (saving) return <span className="text-xs text-gray-500">Saving…</span>
  if (error) return <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle size={13} /> Not saved</span>
  if (unsaved) return <span className="flex items-center gap-1 text-xs text-amber-700"><AlertCircle size={13} /> Unsaved comments</span>
  if (lastSavedAt) return <span className="flex items-center gap-1 text-xs text-green-700"><CircleCheck size={13} /> All changes saved</span>
  return null
}
