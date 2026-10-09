// Grouped bars: tickets opened vs resolved per day. Pure SVG, server-rendered.
const OPENED = '#2a78d6'
const RESOLVED = '#eb6834'

const W = 720
const H = 220
const PAD = { top: 12, right: 8, bottom: 28, left: 34 }
const BAR = 14
const GAP = 2

function niceMax(v: number) {
  if (v <= 5) return 5
  const step = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step
  return 10 * step
}

const label = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// Rect with only the top corners rounded (data end), square at the baseline.
function bar(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export default function TrendChart({
  data,
  selectedDay,
  showResolved,
}: {
  data: { day: string; opened: number; resolved: number }[]
  selectedDay: string
  showResolved: boolean
}) {
  const max = niceMax(Math.max(1, ...data.map(d => Math.max(d.opened, showResolved ? d.resolved : 0))))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const band = plotW / data.length
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]

  return (
    <figure className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: OPENED }} /> Opened</span>
        {showResolved && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: RESOLVED }} /> Resolved</span>}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px] h-auto" role="img" aria-label="Tickets opened and resolved per day, last 14 days">
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-gray-400" fontSize={11}>{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2
            const groupW = showResolved ? BAR * 2 + GAP : BAR
            const x0 = cx - groupW / 2
            const isSel = d.day === selectedDay
            return (
              <g key={d.day}>
                {isSel && <rect x={PAD.left + band * i + 2} y={PAD.top} width={band - 4} height={plotH} fill="#f3f4f6" rx={4} />}
                <path d={bar(x0, y(d.opened), BAR, PAD.top + plotH - y(d.opened))} fill={OPENED} />
                {showResolved && <path d={bar(x0 + BAR + GAP, y(d.resolved), BAR, PAD.top + plotH - y(d.resolved))} fill={RESOLVED} />}
                {(i % 2 === data.length % 2 || isSel) && (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} className={isSel ? 'fill-gray-900 font-semibold' : 'fill-gray-500'}>
                    {label(d.day)}
                  </text>
                )}
                {/* Hover target covers the whole day, not just the bars. */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent">
                  <title>{`${label(d.day)}: ${d.opened} opened${showResolved ? `, ${d.resolved} resolved` : ''}`}</title>
                </rect>
              </g>
            )
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#9ca3af" strokeWidth={1} />
        </svg>
      </div>
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer select-none text-gray-500 hover:text-gray-800">View as table</summary>
        <table className="mt-2 text-xs tabular-nums">
          <thead>
            <tr className="text-gray-500"><th className="text-left pr-6 py-1 font-medium">Day</th><th className="text-right pr-6 font-medium">Opened</th>{showResolved && <th className="text-right font-medium">Resolved</th>}</tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.day} className={d.day === selectedDay ? 'font-semibold text-gray-900' : ''}>
                <td className="pr-6 py-0.5">{label(d.day)}</td><td className="text-right pr-6">{d.opened}</td>{showResolved && <td className="text-right">{d.resolved}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
