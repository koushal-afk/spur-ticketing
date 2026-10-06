'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { AppUser, UserRole } from '@/lib/types'

const ROLES: UserRole[] = ['admin', 'executive', 'employee', 'store']

export default function ManageUsersPage() {
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
                <div key={u.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-gray-900">{u.name}</div>
                    <div className="text-gray-500 text-xs">{u.email}</div>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">
                    {u.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
