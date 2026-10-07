import { NextRequest, NextResponse } from 'next/server'
import { archiveTickets } from '@/lib/sheets'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Manually-triggered: moves tickets with lastActiveAt older than ?days=N
// (default 45) into the Archive sheet tab, regardless of status.
// Example: /api/archive?secret=...&days=90
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that env var is set.
  const fromVercelCron = !!process.env.CRON_SECRET
    && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (secret !== process.env.POLL_SECRET && !fromVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const days = Number(req.nextUrl.searchParams.get('days') ?? '45')
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const result = await archiveTickets(cutoff)
    return NextResponse.json({ ...result, cutoff: cutoff.toISOString() })
  } catch (e) {
    console.error('[archive] fatal:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
