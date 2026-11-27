<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2025-2026 lin-snow -->
<template>
  <div>
    <div v-if="editorStore.extensionToAdd.extension_type === ExtensionType.MUSIC">
      <h2 class="text-[var(--color-text-secondary)] font-bold mb-1">
        {{ t('editor.musicShare') }}
      </h2>
      <p class="text-[var(--color-text-muted)] text-sm">{{ t('editor.musicSupportHint') }}</p>
      <p class="text-[var(--color-text-muted)] text-sm mb-1">
        {{ t('editor.musicVipHint') }}
      </p>
      <p v-if="musicSourceMissing" class="text-[var(--color-danger)] text-sm mb-1">
        {{ t('editor.musicSourceMissing') }}
        <button
          type="button"
          class="font-semibold underline-offset-2 hover:underline cursor-pointer"
          @click="goToSystemSetting"
        >
          {{ t('editor.musicSourceGoToSettings') }}
        </button>
      </p>
      <BaseInput
        v-model="editorStore.extensionToAdd.extension"
        class="rounded-lg h-auto w-full"
        :placeholder="t('editor.musicUrlPlaceholder')"
      />
      <div
        v-if="
          editorStore.extensionToAdd.extension.length > 0 &&
          editorStore.extensionToAdd.extension_type === ExtensionType.MUSIC
        "
        class="mt-1 text-[var(--color-text-muted)] text-md"
      >
        {{ t('editor.parseResult') }}:
        <span
          v-if="parseMusicURL(editorStore.extensionToAdd.extension)"
          class="text-[var(--color-accent)]"
          >{{ t('editor.parseSuccess') }}</span
        >
        <span v-else class="text-[var(--color-danger)]">{{ t('editor.parseFailed') }}</span>
      </div>
    </div>
    <div v-if="editorStore.extensionToAdd.extension_type === ExtensionType.VIDEO">
      <div class="text-[var(--color-text-secondary)] font-bold mb-1">
        {{ t('editor.videoShare') }}
      </div>
      <div class="text-[var(--color-text-muted)] mb-1">{{ t('editor.videoExtractHint') }}</div>
      <BaseInput
        v-model="editorStore.videoURL"
        class="rounded-lg h-auto w-full my-2"
        :placeholder="t('editor.videoUrlPlaceholder')"
      />
      <div class="text-[var(--color-text-secondary)] my-1">
        {{ t('editor.videoId') }}: {{ editorStore.extensionToAdd.extension }}
      </div>
    </div>
    <div v-if="editorStore.extensionToAdd.extension_type === ExtensionType.GITHUBPROJ">
      <div class="text-[var(--color-text-secondary)] font-bold mb-1">
        {{ t('editor.githubShare') }}
      </div>
      <BaseInput
        v-model="editorStore.extensionToAdd.extension"
        class="rounded-lg h-auto w-full"
        :placeholder="t('editor.githubUrlPlaceholder')"
      />
    </div>
    <div v-if="editorStore.extensionToAdd.extension_type === ExtensionType.TWEET">
      <div class="text-[var(--color-text-secondary)] font-bold mb-1">
        {{ t('editor.tweetShare') }}
      </div>
      <p class="text-[var(--color-text-muted)] text-sm mb-1">{{ t('editor.tweetHint') }}</p>
      <BaseInput
        v-model="editorStore.tweetToAdd.url"
        class="rounded-lg h-auto w-full"
        :placeholder="t('editor.tweetUrlPlaceholder')"
      />
      <div
        v-if="editorStore.tweetToAdd.url.trim()"
        class="mt-1 text-[var(--color-text-muted)] text-md"
      >
        {{ t('editor.parseResult') }}:
        <span v-if="parsedTweet" class="text-[var(--color-accent)]">
          @{{ parsedTweet.username }} · {{ parsedTweet.statusId }}
        </span>
        <span v-else class="text-[var(--color-danger)]">{{ t('editor.tweetUrlInvalid') }}</span>
      </div>
    </div>
    <div v-if="editorStore.extensionToAdd.extension_type === ExtensionType.WEBSITE">
      <div class="text-[var(--color-text-secondary)] font-bold mb-1">
        {{ t('editor.websiteShare') }}
      </div>
      <BaseInput
        v-model="editorStore.websiteToAdd.title"
        class="rounded-lg h-auto w-full mb-2"
        :placeholder="t('editor.websiteTitlePlaceholder')"
      />
      <div class="flex items-center gap-2">
        <BaseInput
          v-model="editorStore.websiteToAdd.site"
          class="rounded-lg h-auto flex-1"
          :placeholder="t('editor.websiteUrlPlaceholder')"
        />
        <BaseButton
          class="rounded-md px-3 py-2 text-sm whitespace-nowrap"
          :disabled="isFetchingWebsiteTitle"
          @click="handleFetchWebsiteTitle"
        >
          {{ isFetchingWebsiteTitle ? t('editor.fetchingTitle') : t('editor.fetchTitle') }}
        </BaseButton>
      </div>
    </div>
    <div v-if="editorStore.extensionToAdd.extension_type === ExtensionType.LOCATION">
      <div class="text-[var(--color-text-secondary)] font-bold mb-1">
        {{ t('editor.locationShare') }}
      </div>
      <p class="text-[var(--color-text-muted)] text-sm mb-2">
        {{ t('editor.locationHint') }}
      </p>

      <LocationPicker class="mb-2" :lat-lng="pickerLatLng" @change="handleMapChange" />

      <form class="flex items-center gap-2 mb-2" @submit.prevent="handleSearchPlaces">
        <BaseInput
          v-model="searchQuery"
          :placeholder="t('editor.locationSearchPlaceholder')"
          :aria-label="t('editor.locationSearchPlaceholder')"
          class="flex-1 min-w-0"
        />
        <button
          type="submit"
          class="rounded-md px-3 py-2 text-sm border border-[var(--color-border-subtle)] cursor-pointer whitespace-nowrap shrink-0"
          :disabled="searching || isGeolocating || !searchQuery.trim()"
        >
          {{ searching ? t('editor.locationLookingUp') : t('editor.locationSearch') }}
        </button>
      </form>
      <p v-if="searchMessage" class="text-sm mb-2 text-[var(--color-text-muted)]" role="status">
        {{ searchMessage }}
      </p>
      <ul
        v-if="searchResults.length"
        class="mb-2 max-h-48 overflow-auto border border-[var(--color-border-subtle)] rounded-md"
      >
        <li v-for="place in searchResults" :key="place.id">
          <button
            type="button"
            class="w-full text-left px-3 py-2 cursor-pointer hover:bg-[var(--color-bg-muted)]"
            @click="selectPlace(place)"
          >
            <span class="block font-medium">{{ place.name }}</span>
            <span class="block text-xs text-[var(--color-text-muted)]">{{ place.address }}</span>
          </button>
        </li>
      </ul>

      <div class="flex flex-wrap items-center gap-2 mb-2">
        <BaseButton
          class="rounded-md px-3 py-2 text-sm whitespace-nowrap"
          :disabled="isGeolocating"
          @click="handleUseCurrentLocation"
        >
          {{ isGeolocating ? t('editor.locationGeolocating') : t('editor.locationUseCurrent') }}
        </BaseButton>
        <BaseButton
          class="rounded-md px-3 py-2 text-sm whitespace-nowrap"
          :disabled="!hasLocationSelected"
          @click="handleClearLocation"
        >
          {{ t('editor.locationClear') }}
        </BaseButton>
        <span v-if="isFetchingGeocoding" class="text-[var(--color-text-muted)] text-xs">
          {{ t('editor.locationLookingUp') }}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-2">
        <BaseInput
          v-model.number="latInput"
          type="number"
          :placeholder="t('editor.locationLatPlaceholder')"
          class="rounded-lg h-auto w-full"
        />
        <BaseInput
          v-model.number="lngInput"
          type="number"
          :placeholder="t('editor.locationLngPlaceholder')"
          class="rounded-lg h-auto w-full"
        />
      </div>

      <textarea
        v-model="editorStore.locationToAdd.placeholder"
        class="w-full rounded-lg border border-[var(--input-border-color)] bg-[var(--input-bg-color)]! text-[var(--input-text-color)] shadow-[var(--shadow-sm)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--input-focus-ring-color)] resize-y min-h-[5.5rem]"
        rows="4"
        :placeholder="t('editor.locationPlaceholderInput')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import LocationPicker from '@/components/advanced/extension/shared/LocationPicker.vue'
import {
  loadAMap,
  locate,
  reverseAddress,
  searchPlaces,
  type Place,
  type Coordinate,
} from '@/utils/amap'
import { ExtensionType, MusicProvider } from '@/enums/enums'
import { parseMusicURL, extractAndCleanMusicURL } from '@/utils/other'
import { parseTweetUrl } from '@/utils/tweet'
import { useEditorStore, useSettingStore } from '@/stores'
import { storeToRefs } from 'pinia'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { fetchGetWebsiteTitle } from '@/service/api'
import { theToast } from '@/utils/toast'
import { useI18n } from 'vue-i18n'

const editorStore = useEditorStore()
const router = useRouter()
const { SystemSetting, loading: settingsLoading } = storeToRefs(useSettingStore())
const isFetchingWebsiteTitle = ref(false)
const { t } = useI18n()

const metingAPI = computed(() => (SystemSetting.value?.meting_api ?? '').trim())

// Apple links render through an embed; every other provider needs the
// operator's Meting endpoint, so an unconfigured instance blocks them.
const musicSourceMissing = computed(() => {
  if (editorStore.extensionToAdd.extension_type !== ExtensionType.MUSIC) return false
  if (settingsLoading.value || metingAPI.value) return false
  // Stay quiet until the field holds a link that actually needs a resolver;
  // empty or unparsable input is reported by the parse-result line instead.
  const provider = parseMusicURL(editorStore.extensionToAdd.extension)
  return provider !== null && provider.server !== MusicProvider.APPLE
})

function goToSystemSetting() {
  router.push('/panel/setting')
}

const parsedTweet = computed(() => parseTweetUrl(editorStore.tweetToAdd.url))

const isGeolocating = ref(false)
const isFetchingGeocoding = ref(false)
const searchQuery = ref('')
const searching = ref(false)
const searchResults = ref<Place[]>([])
const searchMessage = ref('')
let locationRequest = 0
let searchRequest = 0
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  locationRequest++
  searchRequest++
})
const getMapSDK = () =>
  loadAMap(SystemSetting.value.amap_key || '', SystemSetting.value.amap_security_code || '')

function locationError(error: unknown) {
  if (!SystemSetting.value.amap_key) return t('editor.locationSetupRequired')
  if (error instanceof Error && error.message === 'AMAP_APPROXIMATE_ONLY')
    return t('editor.locationApproximateOnly')
  return t('editor.locationServiceError')
}

async function handleSearchPlaces() {
  const query = searchQuery.value.trim()
  if (!query) return
  const request = ++searchRequest
  searching.value = true
  searchResults.value = []
  searchMessage.value = ''
  const center = pickerLatLng.value
  try {
    const results = await searchPlaces(await getMapSDK(), query, center)
    if (disposed || request !== searchRequest) return
    searchResults.value = results
    if (!results.length) searchMessage.value = t('editor.locationSearchEmpty')
  } catch (error) {
    if (!disposed && request === searchRequest) searchMessage.value = locationError(error)
  } finally {
    if (request === searchRequest) searching.value = false
  }
}

function selectPlace(place: Place) {
  locationRequest++
  isFetchingGeocoding.value = false
  editorStore.locationToAdd.latitude = place.position.lat
  editorStore.locationToAdd.longitude = place.position.lng
  editorStore.locationToAdd.placeholder = [place.name, place.address].filter(Boolean).join(' · ')
  searchResults.value = []
}

const latInput = computed<number | null>({
  get: () => editorStore.locationToAdd.latitude,
  set: (v) => {
    editorStore.locationToAdd.latitude = typeof v === 'number' && Number.isFinite(v) ? v : null
  },
})

const lngInput = computed<number | null>({
  get: () => editorStore.locationToAdd.longitude,
  set: (v) => {
    editorStore.locationToAdd.longitude = typeof v === 'number' && Number.isFinite(v) ? v : null
  },
})

const pickerLatLng = computed(() => {
  const { latitude, longitude } = editorStore.locationToAdd
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null
  }
  return { lat: latitude, lng: longitude }
})

watch(pickerLatLng, () => {
  // Results requested for an old location must not replace the new location's results.
  searchRequest++
  searching.value = false
  searchResults.value = []
  searchMessage.value = ''
})

async function handleMapChange(p: Coordinate) {
  const request = ++locationRequest
  editorStore.locationToAdd.latitude = p.lat
  editorStore.locationToAdd.longitude = p.lng
  const oldName = editorStore.locationToAdd.placeholder
  isFetchingGeocoding.value = true
  try {
    const name = await reverseAddress(await getMapSDK(), p)
    if (
      !disposed &&
      request === locationRequest &&
      name &&
      editorStore.locationToAdd.latitude === p.lat &&
      editorStore.locationToAdd.longitude === p.lng &&
      editorStore.locationToAdd.placeholder === oldName
    )
      editorStore.locationToAdd.placeholder = name
  } catch {
    // Coordinates remain selectable even when reverse geocoding is unavailable.
  } finally {
    if (request === locationRequest) isFetchingGeocoding.value = false
  }
}

const hasLocationSelected = computed(
  () =>
    editorStore.locationToAdd.latitude !== null ||
    editorStore.locationToAdd.longitude !== null ||
    !!editorStore.locationToAdd.placeholder.trim(),
)

function handleClearLocation() {
  locationRequest++
  isFetchingGeocoding.value = false
  editorStore.locationToAdd.latitude = null
  editorStore.locationToAdd.longitude = null
  editorStore.locationToAdd.placeholder = ''
}

async function handleUseCurrentLocation() {
  const request = ++locationRequest
  isGeolocating.value = true
  try {
    const result = await locate(await getMapSDK())
    if (disposed || request !== locationRequest) return
    editorStore.locationToAdd.latitude = result.position.lat
    editorStore.locationToAdd.longitude = result.position.lng
    editorStore.locationToAdd.placeholder = result.name
  } catch (error) {
    if (!disposed && request === locationRequest) theToast.error(String(locationError(error)))
  } finally {
    isGeolocating.value = false
  }
}

const handleFetchWebsiteTitle = async () => {
  const websiteURL = (editorStore.websiteToAdd.site || '').trim()
  if (!websiteURL) {
    theToast.warning(String(t('editor.websiteInputRequired')))
    return
  }

  isFetchingWebsiteTitle.value = true
  try {
    const res = await fetchGetWebsiteTitle(websiteURL)
    if (res.code === 1) {
      editorStore.websiteToAdd.title = res.data
      theToast.success(String(t('editor.fetchTitleSuccess')))
    } else {
      theToast.error(res.msg || String(t('editor.fetchTitleFailed')))
    }
  } catch (error) {
    console.error('Failed to fetch website title', error)
    theToast.error(String(t('editor.fetchTitleFailed')))
  } finally {
    isFetchingWebsiteTitle.value = false
  }
}

watch(
  () => editorStore.extensionToAdd.extension,
  (newValue: string) => {
    if (editorStore.extensionToAdd.extension_type !== ExtensionType.MUSIC || !newValue) {
      return
    }

    const value = newValue.trim()

    if (!/https?:\/\//i.test(value)) {
      return
    }

    const cleanUrl = extractAndCleanMusicURL(value)

    if (cleanUrl && cleanUrl !== value) {
      editorStore.extensionToAdd.extension = cleanUrl
    }
  },
)
</script>

<style scoped></style>
