import { NextRequest, NextResponse } from 'next/server'
import { processConversations } from '../cron/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SPUR_API = 'https://api.spurnow.com/mcp'

async function spurRequest(tool: string, params: Record<string, unknown>) {
  const apiKey = process.env.SPUR_API_KEY
  const res = await fetch(`${SPUR_API}?api_key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: params },
    }),
  })
  const data = await res.json()
  const text = data?.result?.content?.[0]?.text ?? data?.content?.[0]?.text
  if (!text) throw new Error(`Spur ${tool} returned no content: ${JSON.stringify(data).slice(0, 200)}`)
  return JSON.parse(text)
}

// Backfill: process one page of Spur results per call (use ?cursor=N to continue)
// Call repeatedly until nextCursor is null to process all historical conversations.
// GET /api/backfill?secret=...&days=7&cursor=12345
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Number(req.nextUrl.searchParams.get('days') ?? '7')
  const cursorParam = req.nextUrl.searchParams.get('cursor')
  const cursor = cursorParam ? Number(cursorParam) : undefined
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const params: Record<string, unknown> = { channelType: 'whatsapp', limit: 50 }
    if (cursor !== undefined) params.cursor = cursor

    const page = await spurRequest('conversation_search', params)
    const batch: Record<string, unknown>[] = page.conversations ?? []

    const inWindow = batch.filter(c => {
      const t = c.lastMessageAt as string | null
      return t && new Date(t) >= since
    })

    const result = await processConversations(inWindow)

    const lastTime = batch[batch.length - 1]?.lastMessageAt as string | null
    const exhausted = !page.nextCursor || batch.length === 0 || !lastTime || new Date(lastTime) < since

    return NextResponse.json({
      ...result,
      page_size: batch.length,
      in_window: inWindow.length,
      nextCursor: exhausted ? null : page.nextCursor,
      done: exhausted,
    })
  } catch (e) {
    console.error('[backfill] fatal:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
