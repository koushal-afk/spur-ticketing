const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// Parse a sheet timestamp value to a JS Date.
// Handles both legacy epoch-second strings and new IST strings ("2026-07-20 14:30:00 IST").
export function parseSheetDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const asNum = Number(value)
  if (!isNaN(asNum) && asNum > 1_000_000_000) return new Date(asNum * 1000) // legacy epoch s
  const clean = value.replace(' IST', '').trim()
  const ms = new Date(clean).getTime()
  if (isNaN(ms)) return null
  return new Date(ms - IST_OFFSET_MS) // stored as shifted IST, subtract to get UTC
}

export function formatIST(value: string | undefined | null, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseSheetDate(value)
  if (!d) return '—'
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...opts })
}
