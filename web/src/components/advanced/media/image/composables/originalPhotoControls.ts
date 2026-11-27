// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import type PhotoSwipe from 'photoswipe'
import { i18n } from '@/locales'
import { theToast } from '@/utils/toast'
import { extractMotionVideo, originalFileName, originalDownloadURL } from '@/utils/motionPhoto'
import { bindPressMotion } from '@/utils/pressMotion'

export function installOriginalPhotoControls(
  pswp: PhotoSwipe,
  items: { src: string; name?: string }[],
) {
  const t = (key: string) => String(i18n.global.t(key))
  let controller: AbortController | null = null
  let original: Promise<Blob> | null = null
  let originalBlob: Blob | null = null
  let originalBlobURL = ''
  let shareFile: File | null = null
  let motionReady: Promise<void> = Promise.resolve()
  let video: HTMLVideoElement | null = null
  let videoURL = ''
  let motionButton: HTMLElement | null = null
  let downloadButton: HTMLAnchorElement | null = null
  let saveHelp: HTMLElement | null = null
  let openOriginal: HTMLAnchorElement | null = null
  let shareButton: HTMLButtonElement | null = null
  let saveHint: HTMLElement | null = null
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
    shareFile = null
    if (originalBlobURL) URL.revokeObjectURL(originalBlobURL)
    originalBlobURL = ''
    if (saveHelp) saveHelp.style.display = 'none'
    stopVideo()
  }
  const updateDownloadControls = () => {
    const item = items[pswp.currIndex]
    if (!item || !downloadButton) return
    const fileName = originalFileName(item.src, item.name)
    const nativeURL = originalDownloadURL(item.src, fileName)
    // Keep a real link ready before the tap. Do not simulate a second click,
    // wait for fetch, or require a popup for a same-origin attachment download.
    downloadButton.href = nativeURL || originalBlobURL || item.src
    downloadButton.download = fileName
    downloadButton.target = nativeURL || originalBlobURL ? '_self' : '_blank'
    if (openOriginal) openOriginal.href = item.src
    if (saveHint) saveHint.textContent = t('imageGallery.originalSaveHint')
    shareFile = originalBlob
      ? new File([originalBlob], fileName, {
          type: originalBlob.type || 'application/octet-stream',
        })
      : null
    if (shareButton) {
      shareButton.hidden = true
      try {
        shareButton.hidden = !(
          shareFile &&
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [shareFile] })
        )
      } catch {
        // Some embedded browsers expose a file-sharing API they cannot use.
      }
    }
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
    updateDownloadControls()
    const current = generation
    if (motionButton) motionButton.style.display = 'none'
    try {
      const blob = await getOriginal()
      if (current !== generation) return
      const item = items[pswp.currIndex]
      if (item && !originalDownloadURL(item.src, originalFileName(item.src, item.name)))
        originalBlobURL = URL.createObjectURL(blob)
      updateDownloadControls()
      const movie = await extractMotionVideo(blob)
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
      tagName: 'a',
      title: t('imageGallery.downloadOriginal'),
      onInit: (element) => {
        downloadButton = element as HTMLAnchorElement
        element.textContent = t('imageGallery.downloadOriginal')
        element.style.cssText =
          'width:auto;padding:0 12px;font-size:14px;color:white;display:flex;align-items:center;text-decoration:none'
        element.setAttribute('rel', 'noopener')
        updateDownloadControls()
      },
      onClick: () => {
        // Browsers do not report whether the user actually saved a download.
        // Leave a visible manual route instead of falsely reporting success.
        if (saveHelp) saveHelp.style.display = ''
      },
    })
    pswp.ui?.registerElement({
      name: 'original-save-help',
      appendTo: 'root',
      onInit: (element) => {
        saveHelp = element
        element.setAttribute('role', 'region')
        element.setAttribute('aria-label', t('imageGallery.downloadOriginal'))
        element.style.cssText =
          'position:absolute;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));max-width:480px;margin:0 auto;padding:12px;box-sizing:border-box;border-radius:10px;background:rgba(20,20,20,.96);color:white;font-size:14px;line-height:1.5;z-index:20;pointer-events:auto;display:none'
        element.addEventListener('pointerdown', (event) => event.stopPropagation())
        element.addEventListener('click', (event) => event.stopPropagation())
        saveHint = document.createElement('p')
        saveHint.setAttribute('role', 'status')
        saveHint.style.cssText = 'margin:0 0 10px'
        const actions = document.createElement('div')
        actions.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px'
        const actionStyle =
          'font:inherit;color:white;padding:8px 10px;border:1px solid #777;border-radius:6px;background:transparent;text-decoration:none;cursor:pointer'
        openOriginal = document.createElement('a')
        openOriginal.textContent = t('imageGallery.openOriginal')
        openOriginal.target = '_blank'
        openOriginal.rel = 'noopener'
        openOriginal.style.cssText = actionStyle
        shareButton = document.createElement('button')
        shareButton.type = 'button'
        shareButton.textContent = t('imageGallery.shareOriginal')
        shareButton.style.cssText = actionStyle
        shareButton.hidden = true
        shareButton.onclick = () => {
          if (!shareFile || typeof navigator.share !== 'function') return
          const current = generation
          // The file is prepared in advance: sharing must start in this tap.
          void navigator.share({ files: [shareFile] }).catch((error: unknown) => {
            if ((error as Error).name !== 'AbortError' && current === generation && saveHint)
              saveHint.textContent = t('imageGallery.originalShareFailed')
          })
        }
        const close = document.createElement('button')
        close.type = 'button'
        close.textContent = t('imageGallery.closeSaveHelp')
        close.style.cssText = actionStyle + ';margin-left:auto'
        close.onclick = () => {
          element.style.display = 'none'
        }
        actions.append(openOriginal, shareButton, close)
        element.append(saveHint, actions)
        updateDownloadControls()
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
