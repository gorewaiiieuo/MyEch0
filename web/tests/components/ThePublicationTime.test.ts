// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThePublicationTime from '@/views/home/modules/TheEditor/ThePublicationTime.vue'
import { useEditorStore } from '@/stores/editor'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('publication time control', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  it('defaults to now and exposes an editable local date on selection', async () => {
    const wrapper = mount(ThePublicationTime)
    expect(wrapper.find('select').element.value).toBe('now')
    expect(wrapper.find('input').exists()).toBe(false)
    await wrapper.find('select').setValue('custom')
    expect(wrapper.find('input').attributes('type')).toBe('datetime-local')
    await wrapper.find('input').setValue('2024-03-12T08:30:42')
    expect(useEditorStore().publicationTime.localTime).toBe('2024-03-12T08:30:42')
    await wrapper.find('select').setValue('now')
    expect(useEditorStore().publicationTime.useNow).toBe(true)
    wrapper.unmount()
  })
})
