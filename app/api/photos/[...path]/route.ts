import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { get } from '@vercel/blob'
import { authOptions } from '@/lib/auth'
import { photoStorageReady } from '@/lib/photos'

// Photos are stored privately; this streams one to a signed-in user.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new NextResponse('Not signed in', { status: 401 })
  if (!photoStorageReady()) return new NextResponse('Photo storage not set up', { status: 503 })

  const { path } = await params
  const pathname = path.map(decodeURIComponent).join('/')
  if (!pathname.startsWith('tickets/')) return new NextResponse('Not found', { status: 404 })

  const result = await get(pathname, { access: 'private' }).catch(() => null)
  if (!result || result.statusCode !== 200) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType,
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
