export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// Sheet timestamps are IST wall-clock strings ("2026-07-20 14:30:00 IST"), plus some
// legacy epoch-second numbers. Returns UTC epoch ms, or 0 if unreadable.
// The string is parsed as UTC explicitly: `new Date("2026-07-20 14:30:00")` would be read
// in the *runtime's* timezone, which is UTC on the server but IST in a browser in India.
export function istToEpoch(value: string | undefined | null): number {
  if (!value) return 0
  const asNum = Number(value)
  if (!isNaN(asNum) && asNum > 1_000_000_000) return asNum * 1000
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return 0
  const [, y, mo, d, h, mi, s] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)) - IST_OFFSET_MS
}

export function epochToIST(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19) + ' IST'
}

export function parseSheetDate(value: string | undefined | null): Date | null {
  const ms = istToEpoch(value)
  return ms ? new Date(ms) : null
}

// IST calendar date ("YYYY-MM-DD") for an epoch, for date filters.
export function istDateKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10)
}

export function formatIST(value: string | undefined | null, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseSheetDate(value)
  if (!d) return '—'
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...opts })
}
