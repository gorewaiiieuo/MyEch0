// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useEchoStore } from '@/stores/echo'
import { fetchAddEcho, fetchGetEchoById, fetchUpdateEcho } from '@/service/api'
import { localStg } from '@/utils/storage'
import { formatLocalPublicationTime } from '@/utils/publicationTime'

vi.mock('@/service/api', () => ({
  fetchAddEcho: vi.fn(),
  fetchUpdateEcho: vi.fn(),
  fetchGetTags: vi.fn(),
  fetchGetEchoById: vi.fn(),
  fetchQueryEchos: vi.fn(),
}))
vi.mock('@/router', () => ({
  default: {
    currentRoute: { value: { query: {} } },
    push: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@/utils/toast', () => ({
  theToast: {
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    promise: vi.fn(async (promise, messages) => {
      const result = await promise
      messages.success(result)
      return result
    }),
  },
}))
vi.mock('@/composables/useBaseDialog', () => ({
  useBaseDialog: () => ({
    openConfirm: (options: { onConfirm: () => void }) => options.onConfirm(),
  }),
}))

const original = (): App.Api.Ech0.Echo => ({
  id: 'historical',
  content: 'Existing entry',
  username: 'tester',
  user_id: 'u1',
  private: false,
  created_at: 1704153607,
})

describe('editor publication time', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
    setActivePinia(createPinia())
    vi.mocked(fetchAddEcho).mockResolvedValue({ code: 0, msg: '' })
    vi.mocked(fetchUpdateEcho).mockResolvedValue({ code: 0, msg: '' })
    vi.mocked(fetchGetEchoById).mockResolvedValue({ code: 1, msg: '', data: original() })
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('leaves a new post time to the server even after waiting in the editor', async () => {
    const store = useEditorStore()
    store.echoToAdd.content = 'Now'
    vi.setSystemTime(new Date('2026-11-25T14:00:00Z'))
    await store.handleAddOrUpdateEcho(false)
    expect(vi.mocked(fetchAddEcho).mock.calls[0]?.[0]).not.toHaveProperty('created_at')
  })

  it('converts a selected local time into Unix seconds for backfilling', async () => {
    const store = useEditorStore()
    store.echoToAdd.content = 'A past day'
    store.publicationTime = { useNow: false, localTime: '2024-03-12T08:30:42' }
    await store.handleAddOrUpdateEcho(false)
    expect(fetchAddEcho).toHaveBeenCalledWith(
      expect.objectContaining({
        created_at: Math.floor(new Date(2024, 2, 12, 8, 30, 42).getTime() / 1000),
      }),
    )
  })

  it.each(['', '2024-02-30T12:00', '2099-01-01T00:00'])(
    'rejects invalid or future time %s',
    async (localTime) => {
      const store = useEditorStore()
      store.echoToAdd.content = 'Invalid'
      store.publicationTime = { useNow: false, localTime }
      await store.handleAddOrUpdateEcho(false)
      expect(fetchAddEcho).not.toHaveBeenCalled()
    },
  )

  it('preserves the exact original timestamp including seconds on an ordinary edit', async () => {
    const store = useEditorStore()
    await store.startUpdate(original())
    expect(store.publicationTime.useNow).toBe(false)
    expect(store.publicationTime.localTime).toBe(formatLocalPublicationTime(1704153607000))
    store.echoToAdd.content = 'Edited'
    await store.handleAddOrUpdateEcho(false)
    expect(fetchUpdateEcho).toHaveBeenCalledWith(
      expect.objectContaining({ created_at: 1704153607 }),
    )
  })

  it('saves a changed timestamp and reloads cursor ordering after success', async () => {
    const store = useEditorStore()
    const refresh = vi.spyOn(useEchoStore(), 'refreshEchos').mockResolvedValue()
    vi.spyOn(useEchoStore(), 'getTags').mockResolvedValue()
    await store.startUpdate(original())
    store.publicationTime.localTime = '2023-02-01T09:00:00'
    const created_at = Math.floor(new Date(2023, 1, 1, 9).getTime() / 1000)
    vi.mocked(fetchUpdateEcho).mockResolvedValue({
      code: 1,
      msg: '',
      data: { ...original(), created_at },
    })
    await store.handleAddOrUpdateEcho(false)
    await Promise.resolve()
    expect(fetchUpdateEcho).toHaveBeenCalledWith(expect.objectContaining({ created_at }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(store.publicationTime).toEqual({ useNow: true, localTime: '' })
  })

  it('can explicitly set an existing post to now', async () => {
    const store = useEditorStore()
    await store.startUpdate(original())
    store.publicationTime.useNow = true
    await store.handleAddOrUpdateEcho(false)
    expect(fetchUpdateEcho).toHaveBeenCalledWith(
      expect.objectContaining({ created_at: Date.now() / 1000 }),
    )
  })

  it('does not save an unfinished time change while synchronizing attachments', async () => {
    const store = useEditorStore()
    await store.startUpdate(original())
    store.publicationTime.localTime = ''
    await store.handleAddOrUpdateEcho(true)
    expect(fetchUpdateEcho).toHaveBeenCalledWith(
      expect.objectContaining({ created_at: 1704153607 }),
    )
  })

  it('restores custom time together with a saved compose draft', async () => {
    const store = useEditorStore()
    store.echoToAdd.content = 'Draft'
    store.publicationTime = { useNow: false, localTime: '2024-03-12T08:30:42' }
    await nextTick()
    await vi.advanceTimersByTimeAsync(650)
    expect(localStg.getItem('editor_echo_draft_v1')).toMatchObject({
      publicationTime: { useNow: false, localTime: '2024-03-12T08:30:42' },
    })
    setActivePinia(createPinia())
    const restored = useEditorStore()
    restored.init()
    expect(restored.publicationTime).toEqual({ useNow: false, localTime: '2024-03-12T08:30:42' })
  })
})
