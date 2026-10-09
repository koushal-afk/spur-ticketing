import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { getAllTickets } from '@/lib/sheets'
import { UserRole } from '@/lib/types'
import { istDateKey } from '@/lib/dateUtils'
import { buildReport, openedEpoch, shiftDay } from '@/lib/report'
import TrendChart from '@/components/TrendChart'

export const dynamic = 'force-dynamic'

const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, sp] = await Promise.all([getServerSession(authOptions), searchParams])
  const role = (session?.user as unknown as { role?: UserRole } | undefined)?.role
  if (role !== 'admin' && role !== 'executive') redirect('/')

  const today = istDateKey(Date.now())
  const raw = Array.isArray(sp.d) ? sp.d[0] : sp.d
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today

  const tickets = await getAllTickets()
  const r = buildReport(tickets, day)
  const resolvedKnown = r.resolutionTracked && day >= r.firstResolvedDay
  const pct = (n: number) => (r.opened ? Math.round((n / r.opened) * 100) : 0)
  const listHref = (q: Record<string, string>) => `/?${new URLSearchParams(q).toString()}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Tickets
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-base font-semibold text-gray-900">Daily Report</h1>
          <nav className="ml-auto flex items-center gap-2" aria-label="Choose day">
            <Link href={`/reports?d=${shiftDay(day, -1)}`} className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50" aria-label="Previous day">
              <ChevronLeft size={16} />
            </Link>
            <form action="/reports" className="flex items-center gap-1.5">
              <input type="date" name="d" defaultValue={day} max={today} className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-800 bg-white" aria-label="Day" />
              <button className="text-sm px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Go</button>
            </form>
            {day < today ? (
              <Link href={`/reports?d=${shiftDay(day, 1)}`} className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50" aria-label="Next day">
                <ChevronRight size={16} />
              </Link>
            ) : (
              <span className="p-1.5 rounded-lg border border-gray-100 text-gray-300"><ChevronRight size={16} /></span>
            )}
            {day !== today && <Link href="/reports" className="text-sm text-blue-600 hover:text-blue-800 px-1">Today</Link>}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{day === today ? 'Today so far' : 'Report for'}</p>
          <h2 className="text-2xl font-semibold text-gray-900 text-balance">{longDate(day)}</h2>
        </div>

        {/* Headline numbers for the day */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Summary">
          <Kpi label="Tickets opened" value={r.opened} href={listHref({ from: day, to: day })} />
          <Kpi
            label="Resolved or closed this day"
            value={resolvedKnown ? r.resolvedToday : null}
            note={resolvedKnown ? undefined : 'Tracked from 9 Oct 2026 onwards'}
          />
          <Kpi label="Still unresolved" value={r.stillOpen} note={r.opened ? `${pct(r.stillOpen)}% of the day’s tickets` : undefined} tone={r.stillOpen ? 'warn' : undefined} />
          <Kpi label="Not taken up yet" value={r.notTakenCount} note="No CX executive assigned" tone={r.notTakenCount ? 'bad' : undefined} href={listHref({ from: day, to: day, stage: 'not_taken' })} />
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-1">Last 14 days</h3>
          <p className="text-xs text-gray-500 mb-4">Tickets opened per day{resolvedKnown || r.resolutionTracked ? ' and resolved per day' : ''}. Hover a day for its numbers.</p>
          <TrendChart data={r.trend} selectedDay={day} showResolved={r.resolutionTracked} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Where the day’s tickets are now" subtitle={`${r.opened} opened`}>
            {r.opened === 0 ? <Empty /> : (
              <ul className="space-y-2.5">
                {r.stage.map(s => (
                  <li key={s.key}>
                    <Link href={listHref({ from: day, to: day, stage: s.key })} className="flex items-center gap-3 group">
                      <span className={`w-36 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full text-center ${s.className}`}>{s.label}</span>
                      <Bar value={s.count} max={r.opened} />
                      <span className="w-14 text-right text-sm tabular-nums text-gray-800 group-hover:underline">{s.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="By type of query" subtitle={r.byType.find(([k]) => k === 'Not set') ? 'Set the type on each ticket to make this useful' : undefined}>
            {r.opened === 0 ? <Empty /> : (
              <ul className="space-y-2.5">
                {r.byType.map(([type, n]) => (
                  <li key={type} className="flex items-center gap-3">
                    <span className={`w-36 shrink-0 text-sm truncate ${type === 'Not set' ? 'text-gray-400 italic' : 'text-gray-700'}`}>{type}</span>
                    <Bar value={n} max={r.opened} />
                    <span className="w-14 text-right text-sm tabular-nums text-gray-800">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="CX executives" subtitle="Of the day’s tickets">
            {r.cx.length === 0 ? <Empty text="No tickets taken up yet." /> : (
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="text-xs text-gray-500"><th className="text-left font-medium pb-2">Name</th><th className="text-right font-medium pb-2">Taken</th><th className="text-right font-medium pb-2">Resolved</th><th className="text-right font-medium pb-2">Open</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {r.cx.map(([name, v]) => (
                    <tr key={name}>
                      <td className="py-1.5"><Link href={listHref({ from: day, to: day, cx: name })} className="text-gray-800 hover:underline">{name}</Link></td>
                      <td className="text-right">{v.taken}</td>
                      <td className="text-right text-green-700">{v.resolved}</td>
                      <td className="text-right text-gray-600">{v.taken - v.resolved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Store executives" subtitle="Of the day’s tickets">
            {r.store.length === 0 ? <Empty text="No tickets assigned to stores." /> : (
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="text-xs text-gray-500"><th className="text-left font-medium pb-2">Name</th><th className="text-right font-medium pb-2">Assigned</th><th className="text-right font-medium pb-2">Replied</th><th className="text-right font-medium pb-2">Waiting</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {r.store.map(([name, v]) => (
                    <tr key={name}>
                      <td className="py-1.5"><Link href={listHref({ from: day, to: day, store: name })} className="text-gray-800 hover:underline">{name}</Link></td>
                      <td className="text-right">{v.assigned}</td>
                      <td className="text-right text-green-700">{v.replied}</td>
                      <td className={`text-right ${v.assigned - v.replied ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>{v.assigned - v.replied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="font-semibold text-gray-900">Open backlog right now</h3>
            <span className="text-sm text-gray-500 tabular-nums">{r.backlog.total.toLocaleString('en-IN')} unresolved tickets in the last 45 days</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.backlog.stages.map(s => (
              <Link key={s.key} href={listHref({ stage: s.key })} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm hover:opacity-80 ${s.className}`}>
                {s.label}<span className="font-semibold tabular-nums">{s.count.toLocaleString('en-IN')}</span>
              </Link>
            ))}
          </div>
        </section>

        {r.notTaken.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Waiting to be taken up</h3>
            <p className="text-xs text-gray-500 mb-3">Opened {day === today ? 'today' : 'this day'}, still unresolved and with no CX executive, oldest first.</p>
            <ul className="divide-y divide-gray-100">
              {r.notTaken.map(t => (
                <li key={t.ticketId}>
                  <Link href={`/tickets/${t.ticketId}`} className="flex items-center gap-3 py-2 hover:bg-gray-50 -mx-2 px-2 rounded">
                    <span className="text-xs text-gray-500 tabular-nums w-16 shrink-0">
                      {new Date(openedEpoch(t)).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span className="text-sm font-medium text-gray-900 w-40 truncate">{t.contactName}</span>
                    <span className="text-sm text-gray-600 truncate">{t.conversationSummary || t.lastMessage}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {r.notTakenCount > r.notTaken.length && (
              <Link href={listHref({ from: day, to: day, stage: 'not_taken' })} className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-800">
                See all {r.notTakenCount}
              </Link>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function Kpi({ label, value, note, tone, href }: { label: string; value: number | null; note?: string; tone?: 'warn' | 'bad'; href?: string }) {
  const body = (
    <>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${value === null ? 'text-gray-300' : tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`}>
        {value === null ? '—' : value.toLocaleString('en-IN')}
      </div>
      {note && <div className="mt-1 text-xs text-gray-500">{note}</div>}
    </>
  )
  const cls = 'block bg-white rounded-xl border border-gray-200 p-4'
  return href ? <Link href={href} className={`${cls} hover:border-gray-300`}>{body}</Link> : <div className={cls}>{body}</div>
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

function Bar({ value, max }: { value: number; max: number }) {
  const w = max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0
  return (
    <span className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${w}%`, background: '#2a78d6' }} />
    </span>
  )
}

function Empty({ text = 'No tickets opened this day.' }: { text?: string }) {
  return <p className="text-sm text-gray-400 italic">{text}</p>
}
