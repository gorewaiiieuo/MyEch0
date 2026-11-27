// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { describe, expect, it } from 'vitest'
import { findMotionVideo, originalDownloadURL, originalFileName } from '@/utils/motionPhoto'

const atom = (type: string, payload = new Uint8Array(8)) => {
  const bytes = new Uint8Array(8 + payload.length)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set(new TextEncoder().encode(type), 4)
  bytes.set(payload, 8)
  return bytes
}
const concat = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let cursor = 0
  for (const p of parts) {
    bytes.set(p, cursor)
    cursor += p.length
  }
  return bytes.buffer
}
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 6, 69, 88, 73, 70, 0xff, 0xd9])
const movie = () =>
  concat(
    atom('ftyp', new TextEncoder().encode('mp42isom')),
    atom('moov'),
    atom('mdat', new Uint8Array([1, 2, 3, 4])),
  )

describe('original motion photo parsing', () => {
  it('uses a same-origin attachment download with the original filename', () => {
    const url = new URL(originalDownloadURL('/api/files/images/hash.jpg', '手机原图.jpg')!)
    expect(url.searchParams.get('download')).toBe('1')
    expect(url.searchParams.get('filename')).toBe('手机原图.jpg')
    expect(url.pathname).toBe('/api/files/images/hash.jpg')
    expect(
      originalDownloadURL('https://external.invalid/api/files/images/hash.jpg', 'a.jpg'),
    ).toBeNull()
    expect(originalDownloadURL('/api/settings', 'a.jpg')).toBeNull()
    expect(originalFileName('/api/files/images/hash.jpg', 'a/b\n.jpg')).toBe('a_b_.jpg')
  })
  it('extracts an embedded MP4 without relying on vendor XMP names or offsets', () => {
    const mp4 = new Uint8Array(movie())
    const full = concat(jpg, mp4)
    expect(findMotionVideo(full)).toEqual({ offset: jpg.length, length: mp4.length })
    expect(new Uint8Array(full).slice(0, jpg.length)).toEqual(jpg)
  })
  it('excludes vendor trailers while keeping the original buffer untouched', () => {
    const mp4 = new Uint8Array(movie())
    const full = concat(jpg, mp4, new TextEncoder().encode('VIVO_OPPO_TRAILER'))
    expect(findMotionVideo(full)).toEqual({ offset: jpg.length, length: mp4.length })
    expect(Array.from(new Uint8Array(full).slice(-17))).toEqual(
      Array.from(new TextEncoder().encode('VIVO_OPPO_TRAILER')),
    )
  })
  it('supports HEIC still containers with an appended movie', () => {
    const still = atom('ftyp', new TextEncoder().encode('heicmif1'))
    const mp4 = new Uint8Array(movie())
    expect(findMotionVideo(concat(still, mp4))).toEqual({
      offset: still.length,
      length: mp4.length,
    })
  })
  it('rejects static photos, plain MP4, false ftyp signatures and truncated movies', () => {
    expect(findMotionVideo(jpg.buffer)).toBeNull()
    expect(findMotionVideo(movie())).toBeNull()
    expect(
      findMotionVideo(concat(jpg, atom('ftyp', new TextEncoder().encode('mp42isom')))),
    ).toBeNull()
    expect(findMotionVideo(concat(jpg, new Uint8Array(movie()).slice(0, -3)))).toBeNull()
  })
})
