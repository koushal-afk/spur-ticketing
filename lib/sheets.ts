import { google, sheets_v4 } from 'googleapis'
import { JWT } from 'google-auth-library'
import { Ticket, TicketStatus, AppUser, UserRole } from './types'
import { istToEpoch, epochToIST } from './dateUtils'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

function toIST(isoString: string | null | undefined): string {
  if (!isoString) return ''
  const ms = new Date(isoString).getTime()
  return isNaN(ms) ? '' : epochToIST(ms)
}

const fromIST = istToEpoch

function getAuth(): any {
  return new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function sheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

// ── Ticket columns ───────────────────────────────────────────────────────────
//
// Columns are located by header name, never by position, so the CX team can
// reorder or add their own columns without the app reading or writing the wrong
// cells. `header` is what a missing column gets created as; `aliases` are older
// names the same data has lived under.

type TicketField = Exclude<keyof Ticket, never>

export const TICKET_COLUMNS: { field: TicketField; header: string; aliases?: string[]; date?: boolean }[] = [
  { field: 'ticketId', header: 'ticket_id' },
  { field: 'conversationId', header: 'conversation_id' },
  { field: 'contactName', header: 'contact_name' },
  { field: 'contactPhone', header: 'contact_phone' },
  { field: 'firstMessage', header: 'first_message' },
  { field: 'lastMessage', header: 'last_message' },
  { field: 'conversationSummary', header: 'chat_summary', aliases: ['conversation_summary'] },
  { field: 'storeAssignedTo', header: 'store_executive', aliases: ['store_assigned_to'] },
  { field: 'status', header: 'status' },
  { field: 'createdAt', header: 'created_at', date: true },
  { field: 'lastActiveAt', header: 'last_active_at', date: true },
  { field: 'updatedAt', header: 'updated_at', date: true },
  { field: 'assignedTo', header: 'cx_executive', aliases: ['assigned_to'] },
  { field: 'queryType', header: 'query_type' },
  { field: 'employeeComment', header: 'cx_comments', aliases: ['employee_comment'] },
  { field: 'storeComments', header: 'store_comments' },
  { field: 'finalResolutionComments', header: 'final_resolution', aliases: ['final_resolution_comments'] },
  { field: 'photos', header: 'photos' },
  { field: 'openedAt', header: 'opened_at', date: true },
  { field: 'resolvedAt', header: 'resolved_at', date: true },
]

export const TICKET_HEADERS = TICKET_COLUMNS.map(c => c.header)

const SHEET_NAME = 'Tickets'
const ARCHIVE_SHEET = 'Archive'

function colLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const norm = (h: unknown) => String(h ?? '').trim().toLowerCase()

type Layout = { header: string[]; index: Partial<Record<TicketField, number>>; width: number }

function layoutFrom(header: string[]): Layout {
  const lower = header.map(norm)
  const index: Partial<Record<TicketField, number>> = {}
  for (const col of TICKET_COLUMNS) {
    for (const name of [col.header, ...(col.aliases ?? [])]) {
      const i = lower.indexOf(name)
      if (i !== -1) { index[col.field] = i; break }
    }
  }
  return { header, index, width: Math.max(header.length, 1) }
}

// Reads the header row of a tab, appending any app column that's missing so
// every field always has a home (this is what silently didn't happen before).
async function ensureLayout(sheets: sheets_v4.Sheets, tab: string): Promise<Layout> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!1:1` })
  const header = (res.data.values?.[0] ?? []).map(h => String(h ?? ''))
  let layout = layoutFrom(header)
  const missing = TICKET_COLUMNS.filter(c => layout.index[c.field] === undefined)
  if (missing.length > 0) {
    const next = [...header]
    // Fill blank header cells first, then extend to the right.
    for (const col of missing) {
      const blank = next.findIndex(h => !String(h ?? '').trim())
      if (blank !== -1) next[blank] = col.header
      else next.push(col.header)
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [next] },
    })
    layout = layoutFrom(next)
  }
  return layout
}

function cell(row: string[], layout: Layout, field: TicketField): string {
  const i = layout.index[field]
  return i === undefined ? '' : (row[i] ?? '')
}

function rowToTicket(row: string[], layout: Layout): Ticket {
  const g = (f: TicketField) => cell(row, layout, f)
  return {
    ticketId: g('ticketId'),
    conversationId: g('conversationId'),
    contactName: g('contactName'),
    contactPhone: g('contactPhone'),
    firstMessage: g('firstMessage'),
    lastMessage: g('lastMessage'),
    conversationSummary: g('conversationSummary'),
    assignedTo: g('assignedTo') || 'Unassigned',
    status: (g('status') as TicketStatus) || 'open',
    createdAt: g('createdAt'),
    lastActiveAt: g('lastActiveAt'),
    updatedAt: g('updatedAt'),
    employeeComment: g('employeeComment'),
    queryType: g('queryType'),
    storeAssignedTo: g('storeAssignedTo'),
    storeComments: g('storeComments'),
    finalResolutionComments: g('finalResolutionComments'),
    photos: g('photos'),
    openedAt: g('openedAt'),
    resolvedAt: g('resolvedAt'),
  }
}

function cellValue(t: Partial<Ticket>, field: TicketField): string {
  const col = TICKET_COLUMNS.find(c => c.field === field)!
  const v = t[field] as string | undefined
  return col.date ? toIST(v) : (v ?? '')
}

function ticketToRow(t: Ticket, layout: Layout): string[] {
  const row = new Array(layout.width).fill('')
  for (const col of TICKET_COLUMNS) {
    const i = layout.index[col.field]
    if (i !== undefined) row[i] = cellValue(t, col.field)
  }
  return row
}

async function readTable(sheets: sheets_v4.Sheets, tab = SHEET_NAME) {
  const layout = await ensureLayout(sheets, tab)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A2:${colLetter(layout.width - 1)}`,
  })
  return { layout, rows: (res.data.values ?? []) as string[][] }
}

// ── Reads ────────────────────────────────────────────────────────────────────

// Short in-memory cache for the ticket list: the sheet read is the slowest part
// of a page load. Writes from this instance invalidate it immediately.
const LIST_TTL_MS = 20_000
let listCache: { at: number; tickets: Ticket[] } | null = null
function invalidateList() { listCache = null }

export async function ensureHeaders() {
  await ensureLayout(sheetsClient(), SHEET_NAME)
}

export async function getAllTickets(opts: { fresh?: boolean } = {}): Promise<Ticket[]> {
  if (!opts.fresh && listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.tickets
  const { layout, rows } = await readTable(sheetsClient())
  const tickets = rows.filter(r => cell(r, layout, 'ticketId')).map(r => rowToTicket(r, layout))
  listCache = { at: Date.now(), tickets }
  return tickets
}

export async function getTicketById(ticketId: string): Promise<Ticket | null> {
  const { layout, rows } = await readTable(sheetsClient())
  const row = rows.find(r => cell(r, layout, 'ticketId') === ticketId)
  return row ? rowToTicket(row, layout) : null
}

// conversationId → latest ticket's { epoch, status, contact } (highest lastActiveAt).
export async function getExistingConversationsDetailed(): Promise<Map<string, {
  epoch: number
  status: string
  contactName: string
  contactPhone: string
}>> {
  const { layout, rows } = await readTable(sheetsClient())
  const map = new Map<string, { epoch: number; status: string; contactName: string; contactPhone: string }>()
  for (const row of rows) {
    const convId = cell(row, layout, 'conversationId')
    if (!convId) continue
    const ms = fromIST(cell(row, layout, 'lastActiveAt'))
    const prev = map.get(convId)
    if (!prev || ms > prev.epoch) {
      map.set(convId, {
        epoch: ms,
        status: cell(row, layout, 'status') || 'open',
        contactName: cell(row, layout, 'contactName'),
        contactPhone: cell(row, layout, 'contactPhone'),
      })
    }
  }
  return map
}

export async function getExistingConversations(): Promise<Map<string, { epoch: number; status: string }>> {
  const detailed = await getExistingConversationsDetailed()
  const map = new Map<string, { epoch: number; status: string }>()
  for (const [id, v] of detailed) map.set(id, { epoch: v.epoch, status: v.status })
  return map
}

// Kept for the legacy /api/poll route.
export async function getExistingConversationLastActive(): Promise<Map<string, number>> {
  const existing = await getExistingConversations()
  const map = new Map<string, number>()
  for (const [id, v] of existing) map.set(id, v.epoch)
  return map
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function appendTickets(tickets: Ticket[]) {
  if (tickets.length === 0) return
  const sheets = sheetsClient()
  const layout = await ensureLayout(sheets, SHEET_NAME)
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: tickets.map(t => ticketToRow(t, layout)) },
  })
  invalidateList()
}

// Writes only the changed cells, so columns the app doesn't own are never touched.
export async function updateTicket(ticketId: string, updates: Partial<Ticket>) {
  const sheets = sheetsClient()
  const { layout, rows } = await readTable(sheets)
  const rowIndex = rows.findIndex(r => cell(r, layout, 'ticketId') === ticketId)
  if (rowIndex === -1) throw new Error(`Ticket ${ticketId} not found`)

  const sheetRow = rowIndex + 2
  const now = new Date().toISOString()
  const changes: Partial<Ticket> = { ...updates, updatedAt: now }
  const done = (st?: string) => st === 'resolved' || st === 'closed'
  const before = cell(rows[rowIndex], layout, 'status')
  if (updates.status && done(updates.status) && !done(before)) changes.resolvedAt = now
  if (updates.status && !done(updates.status) && done(before)) changes.resolvedAt = ''
  const data = (Object.keys(changes) as TicketField[])
    .filter(f => f !== 'ticketId' && layout.index[f] !== undefined)
    .map(f => ({
      range: `${SHEET_NAME}!${colLetter(layout.index[f]!)}${sheetRow}`,
      values: [[cellValue(changes, f)]],
    }))
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data },
  })
  invalidateList()

  const existing = rowToTicket(rows[rowIndex], layout)
  const result = { ...existing, ...updates, updatedAt: toIST(now) } as Ticket
  if (changes.resolvedAt !== undefined) result.resolvedAt = changes.resolvedAt ? toIST(changes.resolvedAt) : ''
  return result
}

export async function updateTicketLiveData(
  conversationId: string,
  firstMessage: string,
  lastMessage: string,
  conversationSummary: string | undefined,
  lastActiveAt: string,
) {
  const sheets = sheetsClient()
  const { layout, rows } = await readTable(sheets)
  // The last matching row is the most recently appended ticket for this conversation.
  let rowIndex = -1
  for (let i = rows.length - 1; i >= 0; i--) {
    if (cell(rows[i], layout, 'conversationId') === conversationId) { rowIndex = i; break }
  }
  if (rowIndex === -1) return

  const sheetRow = rowIndex + 2
  const put = (f: TicketField, v: string) =>
    layout.index[f] === undefined ? [] : [{ range: `${SHEET_NAME}!${colLetter(layout.index[f]!)}${sheetRow}`, values: [[v]] }]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        ...(firstMessage ? put('firstMessage', firstMessage) : []),
        ...(lastMessage ? put('lastMessage', lastMessage) : []),
        ...(conversationSummary !== undefined ? put('conversationSummary', conversationSummary) : []),
        ...put('lastActiveAt', toIST(lastActiveAt)),
        ...put('updatedAt', toIST(new Date().toISOString())),
      ],
    },
  })
  invalidateList()
}

// Store users see tickets by exact name match on the store executive column, so a
// rename has to carry their existing tickets over or they'd vanish from view.
export async function renameStoreAssignee(oldName: string, newName: string): Promise<number> {
  if (!oldName || oldName === newName) return 0
  const sheets = sheetsClient()
  const { layout, rows } = await readTable(sheets)
  const i = layout.index.storeAssignedTo
  if (i === undefined) return 0
  const data = rows
    .map((r, idx) => ({ value: r[i], sheetRow: idx + 2 }))
    .filter(c => c.value === oldName)
    .map(c => ({ range: `${SHEET_NAME}!${colLetter(i)}${c.sheetRow}`, values: [[newName]] }))
  if (data.length === 0) return 0
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data },
  })
  invalidateList()
  return data.length
}

// ── Archiving ─────────────────────────────────────────────────────────────────

async function sheetIdOf(sheets: sheets_v4.Sheets, title: string): Promise<number | null> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const id = meta.data.sheets?.find(s => s.properties?.title === title)?.properties?.sheetId
  return id ?? null
}

// Moves tickets whose last activity is older than `cutoff` (any status) into the
// Archive tab. Whole rows move — every column, including ones the CX team added —
// and are then deleted from Tickets, so nothing is left behind at old positions.
export async function archiveTickets(cutoff: Date): Promise<{ archived: number; kept: number }> {
  const sheets = sheetsClient()
  const { layout, rows } = await readTable(sheets)
  const cutoffMs = cutoff.getTime()

  const toArchive: { rowIndex: number; row: string[] }[] = []
  let kept = 0
  rows.forEach((row, rowIndex) => {
    if (!cell(row, layout, 'ticketId')) return
    // A row with no readable date is kept, never archived.
    const ms = fromIST(cell(row, layout, 'lastActiveAt')) || fromIST(cell(row, layout, 'createdAt'))
    if (ms > 0 && ms < cutoffMs) toArchive.push({ rowIndex, row })
    else kept++
  })
  if (toArchive.length === 0) return { archived: 0, kept }

  if ((await sheetIdOf(sheets, ARCHIVE_SHEET)) === null) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: ARCHIVE_SHEET } } }] },
    })
  }

  // Give Archive every header Tickets has (by name), then place each cell under
  // the matching Archive header.
  const archRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ARCHIVE_SHEET}!1:1` })
  const archHeader = (archRes.data.values?.[0] ?? []).map(h => String(h ?? ''))
  for (const h of layout.header) {
    if (h.trim() && !archHeader.map(norm).includes(norm(h))) archHeader.push(h)
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${ARCHIVE_SHEET}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [archHeader] },
  })
  const archLower = archHeader.map(norm)
  const moved = toArchive.map(({ row }) => {
    const out = new Array(archHeader.length).fill('')
    layout.header.forEach((h, i) => {
      const j = archLower.indexOf(norm(h))
      if (j !== -1) out[j] = row[i] ?? ''
    })
    return out
  })
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${ARCHIVE_SHEET}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: moved },
  })

  // Delete from the bottom up, merging consecutive rows into single ranges.
  const ticketsSheetId = await sheetIdOf(sheets, SHEET_NAME)
  const indexes = toArchive.map(a => a.rowIndex + 1).sort((a, b) => b - a) // 0-based sheet rows (row 1 = header)
  const ranges: { start: number; end: number }[] = []
  for (const r of indexes) {
    const last = ranges[ranges.length - 1]
    if (last && last.start === r + 1) last.start = r
    else ranges.push({ start: r, end: r + 1 })
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: ranges.map(r => ({
        deleteDimension: { range: { sheetId: ticketsSheetId!, dimension: 'ROWS', startIndex: r.start, endIndex: r.end } },
      })),
    },
  })
  invalidateList()
  return { archived: toArchive.length, kept }
}

// ── Users ────────────────────────────────────────────────────────────────────

const USERS_SHEET = 'Users'
const USER_HEADERS = ['id', 'name', 'email', 'password_hash', 'role']

export async function ensureUsersSheet() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const names = meta.data.sheets?.map(s => s.properties?.title) ?? []
  if (!names.includes(USERS_SHEET)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: USERS_SHEET } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${USERS_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [USER_HEADERS] },
    })
  }
}

export async function getUserByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${USERS_SHEET}!A2:E`,
  })
  const row = (res.data.values ?? []).find(r => String(r[2] ?? '').trim().toLowerCase() === email.trim().toLowerCase())
  if (!row) return null
  return {
    id: row[0] ?? '',
    name: String(row[1] ?? '').trim(),
    email: String(row[2] ?? '').trim(),
    passwordHash: row[3] ?? '',
    role: String(row[4] ?? '').trim() as UserRole,
  }
}

export async function getAllUsers(): Promise<AppUser[]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${USERS_SHEET}!A2:E`,
  })
  return (res.data.values ?? []).filter(r => r[0]).map(r => ({
    id: r[0], name: String(r[1] ?? '').trim(), email: String(r[2] ?? '').trim(), role: String(r[4] ?? '').trim() as UserRole,
  }))
}

// ── Cron watermark ────────────────────────────────────────────────────────────

const CONFIG_SHEET = 'Config'
const WATERMARK_KEY = 'last_cron_run'

export async function getCronWatermark(): Promise<Date> {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${CONFIG_SHEET}!A:B`,
    })
    const row = (res.data.values ?? []).find(r => r[0] === WATERMARK_KEY)
    if (row?.[1]) return new Date(row[1])
  } catch {}
  // First ever run — default to 6 minutes ago (slightly more than cron interval)
  return new Date(Date.now() - 6 * 60 * 1000)
}

export async function setCronWatermark(ts: Date): Promise<void> {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Ensure Config sheet exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
    const names = meta.data.sheets?.map(s => s.properties?.title) ?? []
    if (!names.includes(CONFIG_SHEET)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: CONFIG_SHEET } } }] },
      })
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${CONFIG_SHEET}!A:B`,
    })
    const rows = res.data.values ?? []
    const rowIdx = rows.findIndex(r => r[0] === WATERMARK_KEY)
    if (rowIdx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${CONFIG_SHEET}!B${rowIdx + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[ts.toISOString()]] },
      })
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${CONFIG_SHEET}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[WATERMARK_KEY, ts.toISOString()]] },
      })
    }
  } catch (e) {
    console.error('[sheets] setCronWatermark failed:', e)
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function createUser(name: string, email: string, passwordHash: string, role: UserRole) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const id = `USR-${Date.now()}`
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${USERS_SHEET}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, name, email, passwordHash, role]] },
  })
  return id
}

async function findUserRow(sheets: ReturnType<typeof google.sheets>, id: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${USERS_SHEET}!A2:E`,
  })
  const rows = res.data.values ?? []
  const index = rows.findIndex(r => r[0] === id)
  return { rows, index, sheetRow: index + 2 }
}

export async function updateUser(
  id: string,
  updates: { name?: string; email?: string; role?: UserRole; passwordHash?: string },
): Promise<{ before: AppUser; after: AppUser } | null> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const { rows, index, sheetRow } = await findUserRow(sheets, id)
  if (index === -1) return null

  const row = rows[index]
  const before: AppUser = { id, name: row[1] ?? '', email: row[2] ?? '', role: row[4] as UserRole }
  const next = [
    id,
    updates.name ?? row[1] ?? '',
    updates.email ?? row[2] ?? '',
    updates.passwordHash ?? row[3] ?? '',
    updates.role ?? row[4] ?? '',
  ]
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${USERS_SHEET}!A${sheetRow}:E${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [next] },
  })
  return { before, after: { id, name: next[1], email: next[2], role: next[4] as UserRole } }
}

export async function deleteUser(id: string): Promise<boolean> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const { index, sheetRow } = await findUserRow(sheets, id)
  if (index === -1) return false

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheetId = meta.data.sheets?.find(s => s.properties?.title === USERS_SHEET)?.properties?.sheetId
  if (sheetId === undefined || sheetId === null) return false

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: sheetRow - 1, endIndex: sheetRow },
        },
      }],
    },
  })
  return true
}

// ── Dropdown options ──────────────────────────────────────────────────────────
//
// Admin-editable lists (e.g. query types) live in an "Options" tab: column A is
// the list name, column B the value, in display order.

const OPTIONS_SHEET = 'Options'
export const OPTION_LISTS = { query_type: 'Query types' } as const
export type OptionList = keyof typeof OPTION_LISTS

const OPTION_DEFAULTS: Record<OptionList, string[]> = {
  query_type: [
    'General Query', 'ECOM Order', 'Order Issue', 'Product Issue',
    'Refund / Cashback', 'Delivery Delay', 'Account / App', 'Others',
  ],
}

const OPTIONS_TTL_MS = 60_000
let optionsCache: { at: number; rows: string[][] } | null = null

async function readOptionRows(sheets: sheets_v4.Sheets): Promise<string[][]> {
  if (optionsCache && Date.now() - optionsCache.at < OPTIONS_TTL_MS) return optionsCache.rows
  if ((await sheetIdOf(sheets, OPTIONS_SHEET)) === null) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: OPTIONS_SHEET } } }] },
    })
    const seed = [['list', 'value'], ...Object.entries(OPTION_DEFAULTS).flatMap(([list, values]) => values.map(v => [list, v]))]
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${OPTIONS_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: seed },
    })
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${OPTIONS_SHEET}!A2:B` })
  const rows = (res.data.values ?? []).filter(r => r[0] && String(r[1] ?? '').trim()) as string[][]
  optionsCache = { at: Date.now(), rows }
  return rows
}

export async function getOptions(list: OptionList): Promise<string[]> {
  const rows = await readOptionRows(sheetsClient())
  const values = rows.filter(r => r[0] === list).map(r => String(r[1]).trim())
  return values.length > 0 ? values : OPTION_DEFAULTS[list]
}

export async function setOptions(list: OptionList, values: string[]): Promise<string[]> {
  const sheets = sheetsClient()
  const rows = await readOptionRows(sheets)
  const clean = Array.from(new Set(values.map(v => v.trim()).filter(Boolean)))
  const next = [...rows.filter(r => r[0] !== list), ...clean.map(v => [list, v])]
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${OPTIONS_SHEET}!A2:B` })
  if (next.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${OPTIONS_SHEET}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: next },
    })
  }
  optionsCache = null
  return clean
}
