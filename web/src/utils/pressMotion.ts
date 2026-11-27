// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { extractMotionVideo } from './motionPhoto'

type PressMotionOptions = {
  prepare: () => Promise<boolean>
  play: () => void
  stop: () => void
  accepts?: (target: EventTarget | null) => boolean
}

/** Touch/pen holds play; taps, scrolling, release and late network replies do not. */
export function bindPressMotion(element: HTMLElement, options: PressMotionOptions) {
  let pointer: { id: number; x: number; y: number; token: number } | null = null
  let token = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let suppressUntil = 0
  let started = false
  let held = false
  const stop = () => {
    token++
    pointer = null
    clearTimeout(timer)
    held = false
    if (started) options.stop()
    started = false
  }
  const down = (event: PointerEvent) => {
    if (
      event.pointerType === 'mouse' ||
      event.isPrimary === false ||
      (options.accepts && !options.accepts(event.target))
    )
      return
    stop()
    const current = ++token
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, token: current }
    const ready = options.prepare().catch(() => false)
    timer = setTimeout(() => {
      held = true
      void ready.then((available) => {
        if (!available || !pointer || current !== token || !held) return
        started = true
        suppressUntil = Date.now() + 1000
        options.play()
      })
    }, 350)
  }
  const up = (event: PointerEvent) => {
    if (pointer?.id !== event.pointerId) return
    if (started) suppressUntil = Date.now() + 700
    stop()
  }
  const move = (event: PointerEvent) => {
    if (
      pointer?.id === event.pointerId &&
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10
    )
      stop()
  }
  const click = (event: MouseEvent) => {
    if (options.accepts && !options.accepts(event.target)) return
    if (Date.now() < suppressUntil) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  const contextmenu = (event: Event) => {
    if (held || started) event.preventDefault()
  }
  const hidden = () => {
    if (document.hidden) stop()
  }
  element.addEventListener('pointerdown', down, true)
  element.addEventListener('click', click, true)
  element.addEventListener('contextmenu', contextmenu)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  window.addEventListener('blur', stop)
  window.addEventListener('scroll', stop, true)
  document.addEventListener('visibilitychange', hidden)
  return () => {
    stop()
    element.removeEventListener('pointerdown', down, true)
    element.removeEventListener('click', click, true)
    element.removeEventListener('contextmenu', contextmenu)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    window.removeEventListener('blur', stop)
    window.removeEventListener('scroll', stop, true)
    document.removeEventListener('visibilitychange', hidden)
  }
}

export function installInlineMotion(element: HTMLElement, src: string, unsupported: () => void) {
  let controller: AbortController | null = null
  let prepared: Promise<boolean> | null = null
  let url = ''
  let video: HTMLVideoElement | null = null
  let disposed = false
  const stopVideo = () => {
    video?.pause()
    video?.remove()
    video = null
  }
  const cleanup = bindPressMotion(element, {
    prepare: () => {
      if (!prepared) {
        controller = new AbortController()
        prepared = fetch(src, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.blob()
          })
          .then(extractMotionVideo)
          .then((movie) => {
            if (disposed || !movie) return false
            url = URL.createObjectURL(movie)
            return true
          })
          .catch(() => {
            prepared = null
            return false
          })
      }
      return prepared
    },
    play: () => {
      if (!url || disposed) return
      stopVideo()
      video = document.createElement('video')
      video.src = url
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.className = 'motion-photo-press-video'
      video.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:black;pointer-events:none;z-index:2'
      video.onerror = () => {
        stopVideo()
        unsupported()
      }
      element.querySelector('.gallery-image-frame')?.append(video)
      const activeVideo = video
      void video.play().catch(() => {
        if (video === activeVideo) {
          stopVideo()
          unsupported()
        }
      })
    },
    stop: stopVideo,
  })
  return () => {
    disposed = true
    cleanup()
    controller?.abort()
    stopVideo()
    if (url) URL.revokeObjectURL(url)
  }
}
