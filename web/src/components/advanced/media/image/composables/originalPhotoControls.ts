// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import type PhotoSwipe from 'photoswipe'
import { i18n } from '@/locales'
import { theToast } from '@/utils/toast'
import {
  extractMotionVideo,
  originalFileName,
  originalDownloadURL,
  downloadOriginalURL,
  saveOriginal,
} from '@/utils/motionPhoto'
import { bindPressMotion } from '@/utils/pressMotion'

export function installOriginalPhotoControls(
  pswp: PhotoSwipe,
  items: { src: string; name?: string }[],
) {
  const t = (key: string) => String(i18n.global.t(key))
  let controller: AbortController | null = null
  let original: Promise<Blob> | null = null
  let originalBlob: Blob | null = null
  let motionReady: Promise<void> = Promise.resolve()
  let video: HTMLVideoElement | null = null
  let videoURL = ''
  let motionButton: HTMLElement | null = null
  let downloadButton: HTMLElement | null = null
  let generation = 0
  let playing = false
  let initialized = false
  let unbindPress: (() => void) | undefined
  const setMotionLabel = (label: string) => {
    if (!motionButton) return
    motionButton.textContent = label
    motionButton.setAttribute('aria-label', label)
    motionButton.title = label
  }

  const stopVideo = () => {
    video?.pause()
    video?.remove()
    video = null
    if (videoURL) URL.revokeObjectURL(videoURL)
    videoURL = ''
    playing = false
    setMotionLabel(t('imageGallery.playMotion'))
  }
  const clean = () => {
    generation++
    controller?.abort()
    controller = null
    original = null
    originalBlob = null
    stopVideo()
  }
  const getOriginal = () => {
    if (!original) {
      controller = new AbortController()
      const request = fetch(items[pswp.currIndex]?.src || '', { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.blob()
        })
        .then((blob) => {
          if (original === request) originalBlob = blob
          return blob
        })
      // A failed request can be retried by the download button.
      original = request
      request.catch(() => {
        if (original === request) original = null
      })
    }
    return original
  }

  const prepareMotion = async () => {
    clean()
    const current = generation
    if (motionButton) motionButton.style.display = 'none'
    try {
      const movie = await extractMotionVideo(await getOriginal())
      if (current !== generation || !movie || !motionButton) return
      videoURL = URL.createObjectURL(movie)
      motionButton.style.display = ''
      setMotionLabel(t('imageGallery.playMotion'))
    } catch {
      // Cross-origin files without CORS can still be viewed as ordinary images.
    }
  }

  pswp.on('uiRegister', () => {
    pswp.ui?.registerElement({
      name: 'download-original',
      order: 8,
      isButton: true,
      title: t('imageGallery.downloadOriginal'),
      onInit: (element) => {
        downloadButton = element
        element.textContent = t('imageGallery.downloadOriginal')
        element.style.cssText = 'width:auto;padding:0 12px;font-size:14px;color:white'
      },
      onClick: () => {
        const item = items[pswp.currIndex]
        const current = generation
        if (!item) return
        const fileName = originalFileName(item.src, item.name)
        const nativeURL = originalDownloadURL(item.src, fileName)
        if (nativeURL) {
          // Trigger a server attachment synchronously in the user's tap handler.
          // Mobile browsers must not depend on a delayed synthetic Blob click.
          downloadOriginalURL(nativeURL, fileName)
          return
        }
        if (originalBlob) {
          void saveOriginal(originalBlob, fileName).catch(() =>
            theToast.error(t('imageGallery.originalDownloadFailed')),
          )
          return
        }
        if (downloadButton) downloadButton.textContent = t('imageGallery.downloadingOriginal')
        void getOriginal()
          .then((blob) => saveOriginal(blob, fileName))
          .catch((err) => {
            if ((err as Error).name !== 'AbortError')
              theToast.error(t('imageGallery.originalDownloadFailed'))
          })
          .finally(() => {
            if (downloadButton && current === generation)
              downloadButton.textContent = t('imageGallery.downloadOriginal')
          })
      },
    })
    pswp.ui?.registerElement({
      name: 'motion-photo',
      order: 7,
      isButton: true,
      title: t('imageGallery.playMotion'),
      onInit: (element) => {
        motionButton = element
        element.style.cssText = 'display:none;width:auto;padding:0 12px;font-size:14px;color:white'
      },
      onClick: () => {
        if (playing) {
          video?.pause()
          video?.remove()
          video = null
          playing = false
          setMotionLabel(t('imageGallery.playMotion'))
          return
        }
        if (!videoURL || !pswp.currSlide?.container.parentElement) return
        video = document.createElement('video')
        video.src = videoURL
        video.controls = true
        video.loop = true
        video.muted = true
        video.playsInline = true
        video.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:black;z-index:5;pointer-events:auto'
        video.addEventListener('pointerdown', (event) => event.stopPropagation())
        video.addEventListener('click', (event) => event.stopPropagation())
        video.onerror = () => {
          theToast.error(t('imageGallery.motionCodecUnsupported'))
          video?.remove()
          video = null
          playing = false
          setMotionLabel(t('imageGallery.playMotion'))
        }
        // The zoom wrapper has no layout size (its image is absolutely positioned).
        // Put the video in the full-size slide holder so percentages have a viewport.
        pswp.currSlide.container.parentElement.append(video)
        playing = true
        setMotionLabel(t('imageGallery.showStill'))
        void video.play().catch(() => {
          /* controls remain available for manual play */
        })
      },
    })
  })
  pswp.on('afterInit', () => {
    initialized = true
    if (pswp.element)
      unbindPress = bindPressMotion(pswp.element, {
        accepts: (target) => target instanceof Element && !!target.closest('.pswp__img'),
        prepare: async () => {
          const current = generation
          await motionReady
          return current === generation && !!videoURL
        },
        play: () => {
          if (!playing) motionButton?.click()
        },
        stop: () => {
          if (playing) motionButton?.click()
        },
      })
    motionReady = prepareMotion()
  })
  pswp.on('change', () => {
    if (!initialized) return
    if (downloadButton) downloadButton.textContent = t('imageGallery.downloadOriginal')
    motionReady = prepareMotion()
  })
  pswp.on('destroy', () => {
    unbindPress?.()
    clean()
  })
}
