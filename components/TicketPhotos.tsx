'use client'
import { useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { Ticket } from '@/lib/types'
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_TICKET, parsePhotos, photoSrc } from '@/lib/photos'

const MAX_EDGE = 1600

// Re-encode as JPEG with the long edge capped, so phone photos (often 5–10 MB) upload fast
// and stay under the server's request size limit.
async function shrink(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error(`Couldn’t read “${file.name}”. Try a JPG or PNG.`)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.82))
  if (!blob) throw new Error(`Couldn’t process “${file.name}”.`)
  return blob
}

export default function TicketPhotos({
  ticket,
  canAdd,
  canRemove,
  onUpdated,
}: {
  ticket: Ticket
  canAdd: boolean
  canRemove: boolean
  onUpdated: (t: Ticket) => void
}) {
  const photos = parsePhotos(ticket.photos)
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError('')
    const list = Array.from(files).slice(0, MAX_PHOTOS_PER_TICKET - photos.length)
    if (list.length < files.length) setError(`Only ${MAX_PHOTOS_PER_TICKET} photos fit on a ticket; the rest were skipped.`)
    for (let i = 0; i < list.length; i++) {
      setProgress(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : 'Uploading…')
      try {
        const blob = await shrink(list[i])
        if (blob.size > MAX_PHOTO_BYTES) throw new Error(`“${list[i].name}” is still over 4 MB after resizing.`)
        const form = new FormData()
        form.append('file', blob, list[i].name.replace(/\.[^.]+$/, '') + (blob.type === 'image/gif' ? '.gif' : '.jpg'))
        const res = await fetch(`/api/tickets/${ticket.ticketId}/photos`, { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Upload failed. Try again.')
        onUpdated(data.ticket)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed. Try again.')
        break
      }
    }
    setProgress('')
    if (input.current) input.current.value = ''
  }

  const remove = async (path: string) => {
    setRemoving(true); setError('')
    const res = await fetch(`/api/tickets/${ticket.ticketId}/photos?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setRemoving(false); setConfirming(null)
    if (res.ok) onUpdated(data.ticket)
    else setError(data.error ?? 'Couldn’t remove the photo.')
  }

  if (!canAdd && photos.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Camera size={16} /> Photos
          {photos.length > 0 && <span className="text-xs font-normal text-gray-400 tabular-nums">{photos.length}</span>}
        </h3>
        {canAdd && photos.length < MAX_PHOTOS_PER_TICKET && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              id={`photos-${ticket.ticketId}`}
              onChange={e => upload(e.target.files)}
              disabled={!!progress}
            />
            <label
              htmlFor={`photos-${ticket.ticketId}`}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer ${progress ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <ImagePlus size={14} /> {progress || 'Add photos'}
            </label>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No photos yet. Add the customer’s photos of the product, bill or delivery.</p>
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map(p => (
            <li key={p} className="relative group aspect-square">
              <a href={photoSrc(p)} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(p)} alt="Ticket photo" loading="lazy" className="w-full h-full object-cover rounded-lg border border-gray-200 bg-gray-50" />
              </a>
              {canRemove && (confirming === p ? (
                <div className="absolute inset-0 rounded-lg bg-black/60 flex flex-col items-center justify-center gap-1.5 p-1">
                  <span className="text-white text-xs">Remove?</span>
                  <div className="flex gap-1">
                    <button onClick={() => remove(p)} disabled={removing} className="text-xs px-2 py-0.5 rounded bg-red-600 text-white disabled:opacity-50">
                      {removing ? '…' : 'Remove'}
                    </button>
                    <button onClick={() => setConfirming(null)} className="text-xs px-2 py-0.5 rounded bg-white text-gray-800">Keep</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(p)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-gray-700 shadow opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  aria-label="Remove photo"
                >
                  <X size={12} />
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
