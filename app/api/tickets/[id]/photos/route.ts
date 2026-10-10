import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { put, del } from '@vercel/blob'
import { authOptions } from '@/lib/auth'
import { getTicketById, updateTicket } from '@/lib/sheets'
import { UserRole } from '@/lib/types'
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_TICKET, parsePhotos, photoStorageReady } from '@/lib/photos'

export const maxDuration = 30

const NOT_READY = 'Photo storage isn’t set up yet. An admin needs to connect a Vercel Blob store to the project.'

async function sessionUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return { role: (session.user as unknown as { role?: UserRole }).role, name: session.user.name ?? '' }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'Sign in again to upload photos.' }, { status: 401 })
  if (!photoStorageReady()) return NextResponse.json({ error: NOT_READY }, { status: 503 })

  const { id } = await params
  const ticket = await getTicketById(id)
  if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })

  const isCx = user.role === 'admin' || user.role === 'executive'
  const isAssignedStore = user.role === 'store' && ticket.storeAssignedTo === user.name
  if (!isCx && !isAssignedStore) return NextResponse.json({ error: 'You can’t add photos to this ticket.' }, { status: 403 })

  const existing = parsePhotos(ticket.photos)
  if (existing.length >= MAX_PHOTOS_PER_TICKET) {
    return NextResponse.json({ error: `A ticket can have up to ${MAX_PHOTOS_PER_TICKET} photos. Remove one first.` }, { status: 400 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo was attached.' }, { status: 400 })
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, WebP or GIF images can be uploaded.' }, { status: 400 })
  }
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'That photo is too large (max 4 MB).' }, { status: 400 })

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  let blob
  try {
    blob = await put(`tickets/${id}/photo.${ext}`, file, {
      access: 'private',
      addRandomSuffix: true,
      contentType: file.type,
    })
  } catch (e) {
    console.error('[photos] upload failed:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Couldn’t store the photo: ${msg}` }, { status: 502 })
  }

  // Re-read so a photo added by someone else in the meantime isn't dropped.
  const latest = parsePhotos((await getTicketById(id))?.photos)
  const updated = await updateTicket(id, { photos: [...latest, blob.pathname].join('\n') })
  return NextResponse.json({ ticket: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'executive') {
    return NextResponse.json({ error: 'Only the CX team can remove photos.' }, { status: 403 })
  }
  if (!photoStorageReady()) return NextResponse.json({ error: NOT_READY }, { status: 503 })

  const { id } = await params
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const ticket = await getTicketById(id)
  if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
  const photos = parsePhotos(ticket.photos)
  if (!photos.includes(path)) return NextResponse.json({ error: 'That photo isn’t on this ticket.' }, { status: 404 })

  const updated = await updateTicket(id, { photos: photos.filter(p => p !== path).join('\n') })
  await del(path).catch(e => console.error('[photos] delete blob failed:', e))
  return NextResponse.json({ ticket: updated })
}
