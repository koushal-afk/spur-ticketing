import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTicketById, updateTicket } from '@/lib/sheets'
import { TicketStatus, TicketPriority, UserRole } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = (session.user as unknown as { role?: UserRole }).role
    const name = session.user.name ?? ''

    const { id } = await params
    const body = await req.json()
    const allowed: Record<string, unknown> = {}

    if (role === 'admin' || role === 'executive') {
      if (body.assignedTo !== undefined) allowed.assignedTo = body.assignedTo
      if (body.status !== undefined) allowed.status = body.status as TicketStatus
      if (body.priority !== undefined) allowed.priority = body.priority as TicketPriority
      if (body.conversationSummary !== undefined) allowed.conversationSummary = body.conversationSummary
      if (body.employeeComment !== undefined) allowed.employeeComment = body.employeeComment
      if (body.queryType !== undefined) allowed.queryType = body.queryType
      if (body.storeAssignedTo !== undefined) allowed.storeAssignedTo = body.storeAssignedTo
      if (body.storeComments !== undefined) allowed.storeComments = body.storeComments
      if (body.finalResolutionComments !== undefined) allowed.finalResolutionComments = body.finalResolutionComments
    } else if (role === 'store') {
      // Store users can only add their own comments, and only on a ticket
      // that's actually assigned to them.
      if (body.storeComments !== undefined) {
        const ticket = await getTicketById(id)
        if (!ticket || ticket.storeAssignedTo !== name) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        allowed.storeComments = body.storeComments
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'No editable fields in request' }, { status: 400 })
    }

    const updated = await updateTicket(id, allowed)
    return NextResponse.json({ ticket: updated })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
  }
}
