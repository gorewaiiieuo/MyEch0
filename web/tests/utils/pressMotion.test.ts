// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindPressMotion } from '@/utils/pressMotion'

const pointer = (type: string, x = 20, y = 20) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y })
  return event
}

describe('press and hold motion photos', () => {
  let element: HTMLElement
  let cleanup: (() => void) | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    element = document.createElement('button')
    document.body.append(element)
  })
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    element.remove()
    vi.useRealTimers()
  })
  const setup = (prepare = vi.fn(async () => true)) => {
    const play = vi.fn()
    const stop = vi.fn()
    cleanup = bindPressMotion(element, { prepare, play, stop })
    return { play, stop }
  }
  it('plays after a hold and stops on release, suppressing the following tap', async () => {
    const { play, stop } = setup()
    const click = vi.fn()
    element.addEventListener('click', click)
    element.dispatchEvent(pointer('pointerdown'))
    await vi.advanceTimersByTimeAsync(350)
    expect(play).toHaveBeenCalledTimes(1)
    window.dispatchEvent(pointer('pointerup'))
    expect(stop).toHaveBeenCalledTimes(1)
    element.click()
    expect(click).not.toHaveBeenCalled()
  })
  it('leaves short taps available to open the gallery', async () => {
    const { play } = setup()
    const click = vi.fn()
    element.addEventListener('click', click)
    element.dispatchEvent(pointer('pointerdown'))
    await vi.advanceTimersByTimeAsync(100)
    window.dispatchEvent(pointer('pointerup'))
    element.click()
    await vi.advanceTimersByTimeAsync(400)
    expect(play).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledTimes(1)
  })
  it('does not play while scrolling or after a late download finishes', async () => {
    let ready!: (value: boolean) => void
    const prepare = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          ready = resolve
        }),
    )
    const { play } = setup(prepare)
    element.dispatchEvent(pointer('pointerdown'))
    await vi.advanceTimersByTimeAsync(350)
    window.dispatchEvent(pointer('pointerup'))
    ready(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(play).not.toHaveBeenCalled()
    element.dispatchEvent(pointer('pointerdown'))
    window.dispatchEvent(pointer('pointermove', 20, 45))
    await vi.advanceTimersByTimeAsync(400)
    ready(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(play).not.toHaveBeenCalled()
  })
  it('stops on cancellation and does not replay after disposal', async () => {
    const { play, stop } = setup()
    element.dispatchEvent(pointer('pointerdown'))
    await vi.advanceTimersByTimeAsync(350)
    window.dispatchEvent(pointer('pointercancel'))
    expect(stop).toHaveBeenCalledTimes(1)
    cleanup?.()
    element.dispatchEvent(pointer('pointerdown'))
    await vi.advanceTimersByTimeAsync(400)
    expect(play).toHaveBeenCalledTimes(1)
  })
})
