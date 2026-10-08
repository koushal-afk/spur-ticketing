'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUp, ArrowDown, X, Plus } from 'lucide-react'

type List = { key: string; label: string; values: string[] }

const inputClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

function ListEditor({ list }: { list: List }) {
  const [saved, setSaved] = useState(list.values)
  const [values, setValues] = useState(list.values)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const set = (next: string[]) => { setValues(next); setNotice(''); setError('') }
  const move = (i: number, d: number) => {
    const next = [...values]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    set(next)
  }
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const v = draft.trim()
    if (!v) return
    if (values.some(x => x.toLowerCase() === v.toLowerCase())) { setError(`“${v}” is already in the list.`); return }
    set([...values, v])
    setDraft('')
  }

  const save = async () => {
    setBusy(true); setError('')
    const res = await fetch('/api/admin/options', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list: list.key, values }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Couldn’t save.'); return }
    setSaved(data.values); setValues(data.values)
    setNotice('Saved. New choices show up in the app within a minute.')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">{list.label}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Removing a choice doesn’t change tickets that already use it.
        </p>
      </div>

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {values.map((v, i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-2">
            <input
              value={v}
              onChange={e => set(values.map((x, j) => (j === i ? e.target.value : x)))}
              className="flex-1 min-w-0 text-sm text-gray-800 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 py-0.5"
              aria-label={`Option ${i + 1}`}
            />
            <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">
              <ArrowUp size={14} />
            </button>
            <button onClick={() => move(i, 1)} disabled={i === values.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">
              <ArrowDown size={14} />
            </button>
            <button onClick={() => set(values.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600" aria-label={`Remove ${v}`}>
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a choice" className={`${inputClass} flex-1`} />
        <button type="submit" className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
          <Plus size={14} /> Add
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && (
          <button onClick={() => set(saved)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
            Discard
          </button>
        )}
      </div>
    </div>
  )
}

export default function OptionsPage() {
  const [lists, setLists] = useState<List[] | null>(null)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    fetch('/api/admin/options').then(async res => {
      if (res.status === 403) { setForbidden(true); return }
      const data = await res.json()
      setLists(data.lists ?? [])
    })
  }, [])

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Only admins can change dropdown options.</p>
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
          <h1 className="text-sm sm:text-base font-semibold text-gray-900">Dropdown Options</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 space-y-1">
          <p><b>CX executives and store executives</b> come from logins: add or remove them on <Link href="/admin/users" className="underline">Manage Users</Link>.</p>
          <p><b>Statuses</b> (Open, In Progress, Resolved, Closed) are fixed because the workflow depends on them.</p>
        </div>
        {lists === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          lists.map(l => <ListEditor key={l.key} list={l} />)
        )}
      </main>
    </div>
  )
}
