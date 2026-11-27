<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Ech0 local contributors -->
<template>
  <div class="location-picker" :class="customClass">
    <div ref="mapEl" class="location-picker__map"></div>
    <p v-if="error" class="location-picker__message" role="status">{{ error }}</p>
    <div v-if="mapInstance" class="location-picker__controls">
      <button
        type="button"
        :title="t('editor.locationZoomIn')"
        :aria-label="t('editor.locationZoomIn')"
        @click="mapInstance?.zoomIn()"
      >
        +
      </button>
      <button
        type="button"
        :title="t('editor.locationZoomOut')"
        :aria-label="t('editor.locationZoomOut')"
        @click="mapInstance?.zoomOut()"
      >
        −
      </button>
      <a v-if="latLng" :href="mapLink" target="_blank" rel="noopener noreferrer">{{
        t('extensionCard.locationOpenInMaps')
      }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/stores'
import {
  loadAMap,
  toGCJ02,
  toWGS84,
  readPosition,
  type AMapSDK,
  type Coordinate,
} from '@/utils/amap'

const props = withDefaults(
  defineProps<{ readonly?: boolean; latLng?: Coordinate | null; class?: string }>(),
  {
    readonly: false,
    latLng: null,
    class: '',
  },
)
const emit = defineEmits<{ (e: 'change', p: Coordinate): void }>()
const customClass = props.class
const { t } = useI18n()
const settings = useSettingStore()
const mapEl = ref<HTMLElement | null>(null)
const mapInstance = shallowRef<InstanceType<AMapSDK['Map']> | null>(null)
let marker: InstanceType<AMapSDK['Marker']> | null = null
let mounted = false
let generation = 0
const error = ref('')
const mapLink = computed(() => {
  const p = toGCJ02(props.latLng || { lat: 39.9042, lng: 116.4074 })
  return `https://uri.amap.com/marker?position=${p.lng},${p.lat}&coordinate=gaode&src=Ech0&callnative=0`
})

async function initialize() {
  const current = ++generation
  mapInstance.value?.destroy()
  mapInstance.value = null
  marker = null
  error.value = ''
  try {
    const sdk = await loadAMap(
      settings.SystemSetting.amap_key || '',
      settings.SystemSetting.amap_security_code || '',
    )
    if (!mounted || current !== generation || !mapEl.value) return
    const p = toGCJ02(props.latLng || { lat: 35.8617, lng: 104.1954 })
    mapInstance.value = new sdk.Map(mapEl.value, {
      center: [p.lng, p.lat],
      zoom: props.latLng ? 15 : 4,
    })
    marker = new sdk.Marker({ map: mapInstance.value, position: [p.lng, p.lat] })
    marker.setMap(props.latLng ? mapInstance.value : null)
    if (!props.readonly)
      mapInstance.value.on('click', (event) => emit('change', toWGS84(readPosition(event.lnglat))))
  } catch {
    if (current === generation)
      error.value = t(
        settings.SystemSetting.amap_key
          ? 'editor.locationServiceError'
          : 'editor.locationSetupRequired',
      )
  }
}
onMounted(() => {
  mounted = true
  void initialize()
})
watch(
  () => [settings.SystemSetting.amap_key, settings.SystemSetting.amap_security_code],
  () => {
    if (mounted) void initialize()
  },
)
watch(
  () => props.latLng,
  (p) => {
    if (!mapInstance.value || !marker) return
    marker.setMap(p ? mapInstance.value : null)
    if (p) {
      const gcj = toGCJ02(p)
      marker.setPosition([gcj.lng, gcj.lat])
      mapInstance.value.setZoomAndCenter(15, [gcj.lng, gcj.lat])
    }
  },
  { deep: true },
)
onBeforeUnmount(() => {
  mounted = false
  generation++
  mapInstance.value?.destroy()
})
</script>

<style scoped>
.location-picker {
  position: relative;
  height: 18rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg-muted);
}

.location-picker__map {
  width: 100%;
  height: 100%;
}

.location-picker__message {
  position: absolute;
  inset: 1rem;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.location-picker__controls {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.3rem;
}

.location-picker__controls > * {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
}
</style>
