'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { AppUser, UserRole } from '@/lib/types'

const ROLES: UserRole[] = ['admin', 'executive', 'store']

const inputClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function UserRow({ user, isSelf, onChanged }: { user: AppUser; isSelf: boolean; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirmDelete'>('view')
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [role, setRole] = useState<UserRole>(user.role)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const startEdit = () => {
    setName(user.name); setEmail(user.email); setRole(user.role); setPassword('')
    setError(''); setNotice(''); setMode('edit')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const body: Record<string, string> = {}
    if (name !== user.name) body.name = name
    if (email !== user.email) body.email = email
    if (role !== user.role) body.role = role
    if (password) body.password = password
    if (Object.keys(body).length === 0) { setMode('view'); setBusy(false); return }

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Couldn’t save changes.'); return }
    const parts = ['Saved']
    if (password) parts.push('password changed')
    if (data.ticketsMoved) parts.push(`${data.ticketsMoved} assigned ticket${data.ticketsMoved === 1 ? '' : 's'} moved to the new name`)
    setNotice(parts.join(' · '))
    setMode('view')
    await onChanged()
  }

  const remove = async () => {
    setBusy(true); setError('')
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Couldn’t delete user.'); setMode('view'); return }
    await onChanged()
  }

  if (mode === 'edit') {
    return (
      <form onSubmit={save} className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required />
        <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required />
        <select
          className={inputClass}
          value={role}
          onChange={e => setRole(e.target.value as UserRole)}
          disabled={isSelf}
          title={isSelf ? 'You can’t change your own role' : undefined}
        >
          {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <input
          className={inputClass}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="New password (leave blank to keep)"
          autoComplete="new-password"
        />
        {user.role === 'store' && name !== user.name && (
          <p className="sm:col-span-2 text-xs text-amber-700">
            Tickets assigned to “{user.name}” will move to the new name so they stay in this user’s list.
          </p>
        )}
        {error && <p className="sm:col-span-2 text-red-600 text-xs">{error}</p>}
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={() => setMode('view')} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-gray-900 flex items-center gap-2">
            <span className="truncate">{user.name}</span>
            {isSelf && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">You</span>}
          </div>
          <div className="text-gray-500 text-xs truncate">{user.email}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">{user.role}</span>
          {mode === 'confirmDelete' ? (
            <>
              <span className="text-xs text-gray-600">Delete {user.name}?</span>
              <button onClick={remove} disabled={busy} className="text-xs font-medium px-2 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setMode('view')} className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={startEdit} className="text-xs font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50">
                Edit
              </button>
              {!isSelf && (
                <button onClick={() => { setError(''); setMode('confirmDelete') }} className="text-xs font-medium px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {notice && <p className="text-xs text-green-700 mt-1">{notice}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

export default function ManageUsersPage() {
  const { data: session } = useSession()
  const myId = (session?.user as { id?: string } | undefined)?.id ?? ''
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('store')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = async () => {
    const res = await fetch('/api/admin/users')
    if (res.status === 403) { setForbidden(true); setLoading(false); return }
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCreating(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    })
    if (res.ok) {
      setName(''); setEmail(''); setPassword(''); setRole('store')
      await loadUsers()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create user')
    }
    setCreating(false)
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">You don&apos;t have access to this page.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm">
            <ArrowLeft size={16} /> Back
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-sm sm:text-base font-semibold text-gray-900">Manage Users</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <UserPlus size={16} /> Add a new user
          </h2>
          <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
            {error && <p className="sm:col-span-2 text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={creating}
              className="sm:col-span-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {creating ? 'Creating…' : 'Create User'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Existing users</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400">No users yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map(u => (
                <UserRow key={u.id} user={u} isSelf={u.id === myId} onChanged={loadUsers} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
