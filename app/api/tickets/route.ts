import { NextResponse } from 'next/server'
import { getAllTickets } from '@/lib/sheets'

export async function GET() {
  try {
    const tickets = await getAllTickets()
    return NextResponse.json({ tickets })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
  }
}
