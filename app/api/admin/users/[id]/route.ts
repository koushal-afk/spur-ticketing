import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { deleteUser, getAllUsers, renameStoreAssignee, updateUser } from '@/lib/sheets'
import { USER_ROLES, UserRole } from '@/lib/types'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as unknown as { id?: string; role?: string } | undefined
  return user?.role === 'admin' ? user : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const updates: { name?: string; email?: string; role?: UserRole; passwordHash?: string } = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name can’t be empty.' }, { status: 400 })
    updates.name = name
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim()
    if (!email) return NextResponse.json({ error: 'Email can’t be empty.' }, { status: 400 })
    const users = await getAllUsers()
    if (users.some(u => u.id !== id && u.email?.toLowerCase() === email.toLowerCase())) {
      return NextResponse.json({ error: 'Another user already has that email.' }, { status: 400 })
    }
    updates.email = email
  }

  if (body.role !== undefined) {
    if (!USER_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Choose admin, executive or store.' }, { status: 400 })
    }
    if (id === admin.id && body.role !== 'admin') {
      return NextResponse.json({ error: 'You can’t remove your own admin role. Ask another admin.' }, { status: 400 })
    }
    updates.role = body.role
  }

  if (body.password) {
    if (String(body.password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }
    updates.passwordHash = await bcrypt.hash(String(body.password), 10)
  }

  const result = await updateUser(id, updates)
  if (!result) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  let ticketsMoved = 0
  if (result.before.role === 'store' && updates.name && updates.name !== result.before.name) {
    ticketsMoved = await renameStoreAssignee(result.before.name, updates.name)
  }

  return NextResponse.json({ user: result.after, ticketsMoved })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (id === admin.id) {
    return NextResponse.json({ error: 'You can’t delete your own account.' }, { status: 400 })
  }
  const ok = await deleteUser(id)
  if (!ok) return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  return NextResponse.json({ deleted: id })
}
