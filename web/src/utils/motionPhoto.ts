// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

export type MotionVideo = { offset: number; length: number }
const videoBrands = new Set([
  'isom',
  'iso2',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'qt  ',
  '3gp4',
  '3gp5',
  '3gp6',
])

/**
 * Vivo / OPPO JPEG motion photos can contain a complete ISO-BMFF movie after
 * the still image. Validate actual boxes instead of trusting a vendor-specific
 * XMP offset or accidentally interpreting an EXIF thumbnail as the movie.
 * The original file is never rewritten, including manufacturer trailers.
 */
export function findMotionVideo(buffer: ArrayBuffer): MotionVideo | null {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const text = (start: number) => String.fromCharCode(...bytes.subarray(start, start + 4))
  const boxSize = (start: number): number => {
    const size = view.getUint32(start)
    if (size === 0) return bytes.length - start
    if (size !== 1) return size
    if (start + 16 > bytes.length) return -1
    const extended = view.getBigUint64(start + 8)
    return extended <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(extended) : -1
  }
  // Require a still-image container, so ordinary MP4 files aren't misclassified.
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8
  const heif =
    bytes.length >= 16 &&
    text(4) === 'ftyp' &&
    /^(hei[cfx]|hevc|hevx|mif1|msf1|avif)$/.test(text(8))
  if (!jpeg && !heif) return null

  for (let i = 8; i + 16 <= bytes.length; i++) {
    if (bytes[i + 4] !== 0x66 || text(i + 4) !== 'ftyp') continue
    const firstSize = boxSize(i)
    if (
      firstSize < 16 ||
      firstSize > 1024 ||
      i + firstSize > bytes.length ||
      !videoBrands.has(text(i + 8))
    )
      continue
    let cursor = i
    let hasMovie = false
    let hasMedia = false
    while (cursor + 8 <= bytes.length) {
      const type = text(cursor + 4)
      if (!/^[a-zA-Z0-9 ]{4}$/.test(type)) break
      const size = boxSize(cursor)
      if (size < (view.getUint32(cursor) === 1 ? 16 : 8) || cursor + size > bytes.length) break
      if (type === 'moov') hasMovie = true
      if (type === 'mdat') hasMedia = true
      cursor += size
    }
    if (hasMovie && hasMedia) return { offset: i, length: cursor - i }
  }
  return null
}

export async function extractMotionVideo(original: Blob): Promise<Blob | null> {
  const range = findMotionVideo(await original.arrayBuffer())
  return range ? original.slice(range.offset, range.offset + range.length, 'video/mp4') : null
}

export function originalFileName(src: string, name?: string): string {
  let fallback = 'original.jpg'
  try {
    fallback = decodeURIComponent(
      new URL(src, window.location.href).pathname.split('/').pop() || fallback,
    )
  } catch {
    /* keep fallback */
  }
  return Array.from(name || fallback, (char) =>
    char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '_' : char,
  ).join('')
}

/** A real attachment response also works over plain HTTP on a NAS. */
export function originalDownloadURL(src: string, fileName: string): string | null {
  const url = new URL(src, window.location.href)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/files/')) return null
  url.searchParams.set('download', '1')
  url.searchParams.set('filename', fileName)
  return url.href
}

export function downloadOriginalURL(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  // A separate browsing context keeps mobile browsers from replacing Ech0
  // when their native download UI handles an attachment.
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

export async function saveOriginal(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia?.('(pointer: coarse)').matches
  if (mobile && navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      // Some embedded browsers advertise sharing but reject files. Download instead.
    }
  }
  const url = URL.createObjectURL(blob)
  downloadOriginalURL(url, fileName)
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
