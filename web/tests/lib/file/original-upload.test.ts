// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useUpload } from '@/lib/file/useUpload'
import { httpUpload } from '@/lib/file/upload'
import { getPresign, updateFileMeta } from '@/lib/file/api/adapter'

vi.mock('@/stores/user', () => ({ useUserStore: () => ({ isLogin: true }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ authHeader: 'Bearer test' }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/utils/toast', () => ({ theToast: { error: vi.fn(), info: vi.fn() } }))
vi.mock('@/utils/other', () => ({ getFileToAddUrl: () => '' }))
vi.mock('@/utils/image', () => ({
  getImageSize: vi.fn().mockResolvedValue({ width: 2, height: 2 }),
}))
vi.mock('@/lib/file/upload', () => ({
  httpUpload: vi.fn(),
  UPLOAD_KIND: { LOCAL: 'local', S3: 's3' },
}))
vi.mock('@/lib/file/api/adapter', () => ({ getPresign: vi.fn(), updateFileMeta: vi.fn() }))

describe('uploads preserve the original file', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() })
    vi.mocked(httpUpload).mockResolvedValue({
      responseBody: { data: { id: 'f', url: '/api/files/f.jpg' } },
    })
    vi.mocked(getPresign).mockResolvedValue({
      id: 'f',
      key: 'f.jpg',
      file_url: 'https://storage/f.jpg',
      presign_url: 'https://storage/put',
      file_name: 'f.jpg',
      content_type: 'image/jpeg',
    })
    vi.mocked(updateFileMeta).mockResolvedValue({ id: 'f', url: 'https://storage/f.jpg' })
  })
  it.each(['local', 'object'] as const)(
    'sends the exact selected File to %s even if an old caller enables compression',
    async (storage) => {
      const finished = vi.fn()
      const file = new File(
        [new Uint8Array([255, 216, 69, 88, 73, 70, 0, 255, 217, 109, 112, 52, 50])],
        'vivo-original.jpg',
        { type: 'image/jpeg' },
      )
      const queue = useUpload({
        storageType: ref(storage),
        enableCompressor: ref(true),
        onAllComplete: finished,
      })
      queue.addFiles([file])
      await vi.waitFor(() => expect(finished).toHaveBeenCalled())
      expect(vi.mocked(httpUpload).mock.calls[0]?.[0]).toBe(file)
      expect(queue.items.value[0]?.file.size).toBe(file.size)
      expect(queue.items.value[0]?.compressionAttempted).toBeUndefined()
    },
  )
})
