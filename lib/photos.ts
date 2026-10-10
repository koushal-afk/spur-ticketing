export const MAX_PHOTO_BYTES = 4 * 1024 * 1024 // Vercel functions reject request bodies over ~4.5 MB.
export const MAX_PHOTOS_PER_TICKET = 20

export function parsePhotos(value: string | undefined | null): string[] {
  return String(value ?? '').split('\n').map(s => s.trim()).filter(Boolean)
}

export function photoSrc(pathname: string) {
  return `/api/photos/${pathname.split('/').map(encodeURIComponent).join('/')}`
}

// Newer Blob stores connect via Vercel's OIDC token plus BLOB_STORE_ID; older ones via a read-write token.
export const photoStorageReady = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)
