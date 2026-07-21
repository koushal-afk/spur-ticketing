import { NextRequest, NextResponse } from 'next/server'
import { updateTicket } from '@/lib/sheets'
import { TicketStatus, TicketPriority } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed: Record<string, unknown> = {}
    if (body.assignedTo !== undefined) allowed.assignedTo = body.assignedTo
    if (body.status !== undefined) allowed.status = body.status as TicketStatus
    if (body.priority !== undefined) allowed.priority = body.priority as TicketPriority
    if (body.conversationSummary !== undefined) allowed.conversationSummary = body.conversationSummary
    if (body.employeeComment !== undefined) allowed.employeeComment = body.employeeComment
    const updated = await updateTicket(id, allowed)
    return NextResponse.json({ ticket: updated })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
  }
}
