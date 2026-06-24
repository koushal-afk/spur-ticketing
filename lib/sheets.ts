import { google } from 'googleapis'
import { JWT } from 'google-auth-library'
import { Ticket, TicketStatus, TicketPriority } from './types'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

function toIST(isoString: string | null | undefined): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}
const SHEET_NAME = 'Tickets'
const HEADERS = [
  'ticket_id', 'conversation_id', 'contact_name', 'contact_phone',
  'first_message', 'last_message', 'conversation_summary',
  'assigned_to', 'status', 'priority',
  'created_at', 'last_active_at', 'updated_at',
]

function getAuth(): any {
  return new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function rowToTicket(row: string[]): Ticket {
  return {
    ticketId: row[0] ?? '',
    conversationId: row[1] ?? '',
    contactName: row[2] ?? '',
    contactPhone: row[3] ?? '',
    firstMessage: row[4] ?? '',
    lastMessage: row[5] ?? '',
    conversationSummary: row[6] ?? '',
    assignedTo: row[7] ?? 'Unassigned',
    status: (row[8] as TicketStatus) ?? 'open',
    priority: (row[9] as TicketPriority) ?? 'medium',
    createdAt: row[10] ?? '',
    lastActiveAt: row[11] ?? '',
    updatedAt: row[12] ?? '',
  }
}

function ticketToRow(t: Ticket): string[] {
  return [
    t.ticketId, t.conversationId, t.contactName, t.contactPhone,
    t.firstMessage, t.lastMessage, t.conversationSummary,
    t.assignedTo, t.status, t.priority,
    toIST(t.createdAt), toIST(t.lastActiveAt), toIST(t.updatedAt),
  ]
}

export async function ensureHeaders() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // Ensure the Tickets sheet exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title) ?? []
  if (!sheetNames.includes(SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    })
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:M1`,
  })
  if (!res.data.values || res.data.values[0]?.[0] !== 'ticket_id') {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    })
  }
}

export async function getAllTickets(): Promise<Ticket[]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:M`,
  })
  if (!res.data.values) return []
  return res.data.values.filter(r => r[0]).map(rowToTicket)
}

export async function getExistingConversationIds(): Promise<Set<string>> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!B2:B`,
  })
  if (!res.data.values) return new Set()
  return new Set(res.data.values.flat())
}

export async function appendTickets(tickets: Ticket[]) {
  if (tickets.length === 0) return
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: tickets.map(ticketToRow) },
  })
}

export async function updateTicket(ticketId: string, updates: Partial<Ticket>) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:M`,
  })
  const rows = res.data.values ?? []
  const rowIndex = rows.findIndex(r => r[0] === ticketId)
  if (rowIndex === -1) throw new Error(`Ticket ${ticketId} not found`)

  const existing = rowToTicket(rows[rowIndex])
  const updated: Ticket = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  const sheetRow = rowIndex + 2 // +1 for header, +1 for 1-indexed

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A${sheetRow}:M${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [ticketToRow(updated)] },
  })
  return updated
}

export async function updateTicketLiveData(
  conversationId: string,
  firstMessage: string,
  lastMessage: string,
  conversationSummary: string,
  lastActiveAt: string,
) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:M`,
  })
  const rows = res.data.values ?? []
  const rowIndex = rows.findIndex(r => r[1] === conversationId)
  if (rowIndex === -1) return

  const sheetRow = rowIndex + 2
  const now = new Date().toISOString()

  // Update columns E (firstMessage), F (lastMessage), G (summary), L (lastActiveAt), M (updatedAt)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${SHEET_NAME}!E${sheetRow}`, values: [[firstMessage]] },
        { range: `${SHEET_NAME}!F${sheetRow}`, values: [[lastMessage]] },
        { range: `${SHEET_NAME}!G${sheetRow}`, values: [[conversationSummary]] },
        { range: `${SHEET_NAME}!L${sheetRow}`, values: [[toIST(lastActiveAt)]] },
        { range: `${SHEET_NAME}!M${sheetRow}`, values: [[toIST(now)]] },
      ],
    },
  })
}
