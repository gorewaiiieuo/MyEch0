// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type PhotoSwipe from 'photoswipe'
import { installOriginalPhotoControls } from '@/components/advanced/media/image/composables/originalPhotoControls'

vi.mock('@/locales', () => ({ i18n: { global: { t: (key: string) => key } } }))
vi.mock('@/utils/motionPhoto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/motionPhoto')>()),
  extractMotionVideo: vi.fn(async () => null),
}))
vi.mock('@/utils/pressMotion', () => ({ bindPressMotion: vi.fn(() => vi.fn()) }))

type Registration = {
  name: string
  isButton?: boolean
  tagName?: keyof HTMLElementTagNameMap
  onInit?: (element: HTMLElement) => void
  onClick?: (event: MouseEvent) => void
}

function gallery(items = [{ src: '/api/files/images/one.jpg', name: 'original-one.jpg' }]) {
  const listeners = new Map<string, () => void>()
  const controls = new Map<string, { element: HTMLElement; registration: Registration }>()
  const root = document.createElement('div')
  document.body.append(root)
  const pswp = {
    currIndex: 0,
    element: root,
    on: (event: string, callback: () => void) => listeners.set(event, callback),
    ui: {
      registerElement: (registration: Registration) => {
        const element = document.createElement(
          registration.tagName || (registration.isButton ? 'button' : 'div'),
        )
        root.append(element)
        registration.onInit?.(element)
        controls.set(registration.name, { element, registration })
      },
    },
  }
  installOriginalPhotoControls(pswp as unknown as PhotoSwipe, items)
  listeners.get('uiRegister')!()
  listeners.get('afterInit')!()
  return { pswp, listeners, controls }
}

const settle = async () => {
  for (let step = 0; step < 12; step++) await Promise.resolve()
}

describe('original photo save controls', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['original']) })),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/cached-original')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => document.body.replaceChildren())

  it('offers a real current-tab attachment link before the original fetch completes', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const { controls } = gallery()
    const { element, registration } = controls.get('download-original')!
    expect(element).toBeInstanceOf(HTMLAnchorElement)
    const link = element as HTMLAnchorElement
    expect(link.target).toBe('_self')
    expect(link.download).toBe('original-one.jpg')
    expect(new URL(link.href).searchParams.get('download')).toBe('1')
    const syntheticClick = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    const event = new MouseEvent('click', { cancelable: true })
    registration.onClick!(event)
    expect(event.defaultPrevented).toBe(false)
    expect(syntheticClick).not.toHaveBeenCalled()
    const help = controls.get('original-save-help')!.element
    expect(help.style.display).not.toBe('none')
    const fallback = help.querySelector('a')!
    expect(fallback.getAttribute('href')).toBe('/api/files/images/one.jpg')
    expect(fallback.target).toBe('_blank')
    expect(fallback.hasAttribute('download')).toBe(false)
  })

  it('updates both native links and hides old help when the slide changes', () => {
    const { pswp, controls, listeners } = gallery([
      { src: '/api/files/images/one.jpg', name: 'original-one.jpg' },
      { src: '/api/files/images/two.jpg', name: 'original-two.jpg' },
    ])
    controls.get('download-original')!.registration.onClick!(new MouseEvent('click'))
    pswp.currIndex = 1
    listeners.get('change')!()
    const link = controls.get('download-original')!.element as HTMLAnchorElement
    expect(link.download).toBe('original-two.jpg')
    expect(new URL(link.href).pathname).toBe('/api/files/images/two.jpg')
    const help = controls.get('original-save-help')!.element
    expect(help.style.display).toBe('none')
    expect(help.querySelector('a')!.getAttribute('href')).toBe('/api/files/images/two.jpg')
  })

  it('keeps a manual original link when an external server blocks file reads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('CORS blocked')
      }),
    )
    const { controls } = gallery([{ src: 'https://images.example.org/one.jpg', name: 'one.jpg' }])
    await settle()
    const link = controls.get('download-original')!.element as HTMLAnchorElement
    expect(link.href).toBe('https://images.example.org/one.jpg')
    expect(link.target).toBe('_blank')
    expect(controls.get('original-save-help')!.element.querySelector('a')!.href).toBe(link.href)
  })

  it('prepares external blob links before a tap and releases them on cleanup', async () => {
    const { controls, listeners } = gallery([
      { src: 'https://images.example.org/one.jpg', name: 'one.jpg' },
    ])
    await settle()
    const link = controls.get('download-original')!.element as HTMLAnchorElement
    expect(link.href).toBe('blob:http://localhost/cached-original')
    expect(link.target).toBe('_self')
    listeners.get('destroy')!()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/cached-original')
  })

  it('calls file sharing only from an explicit tap, with the prefetched original', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { canShare: () => true, share })
    const { controls } = gallery()
    await settle()
    const help = controls.get('original-save-help')!.element
    const shareButton = help.querySelector('button')!
    expect(shareButton.hidden).toBe(false)
    expect(share).not.toHaveBeenCalled()
    shareButton.click()
    expect(share).toHaveBeenCalledTimes(1)
    expect(share.mock.calls[0]![0].files[0].name).toBe('original-one.jpg')
  })

  it('provides visible recovery instructions when file sharing fails', async () => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('Denied', 'NotAllowedError')
      }),
    })
    const { controls } = gallery()
    await settle()
    const help = controls.get('original-save-help')!.element
    help.querySelector('button')!.click()
    await settle()
    expect(help.querySelector('[role="status"]')!.textContent).toBe(
      'imageGallery.originalShareFailed',
    )
    expect(help.querySelector('a')!.getAttribute('href')).toBe('/api/files/images/one.jpg')
  })
})
