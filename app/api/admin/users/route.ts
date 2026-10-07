import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createUser, getAllUsers, ensureUsersSheet } from '@/lib/sheets'
import { USER_ROLES, UserRole } from '@/lib/types'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as unknown as { role?: string })?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const users = await getAllUsers()
  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if ((session?.user as unknown as { role?: string })?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { name, email, password, role } = await req.json()
  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (!USER_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Choose admin, executive or store.' }, { status: 400 })
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }
  await ensureUsersSheet()
  const existing = await getAllUsers()
  if (existing.some(u => u.email?.toLowerCase() === String(email).toLowerCase())) {
    return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 400 })
  }
  const hash = await bcrypt.hash(password, 10)
  const id = await createUser(name, email, hash, role as UserRole)
  return NextResponse.json({ id })
}
