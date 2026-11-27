// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

export type Coordinate = { lat: number; lng: number }
export type MapPosition = { getLat: () => number; getLng: () => number }
export type MapEvent = { lnglat: MapPosition }
export type Place = { id: string; name: string; address: string; position: Coordinate }
type ServiceResult = {
  info?: string
  message?: string
  position?: MapPosition
  formattedAddress?: string
  location_type?: string
  accuracy?: number
  regeocode?: { formattedAddress?: string }
  poiList?: { pois?: { id: string; name: string; address: string; location: MapPosition }[] }
}
type Callback = (status: string, result: ServiceResult) => void

export interface AMapSDK {
  plugin: (names: string[], ready: () => void) => void
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => {
    on: (event: string, fn: (event: MapEvent) => void) => void
    setZoomAndCenter: (zoom: number, center: number[]) => void
    zoomIn: () => void
    zoomOut: () => void
    destroy: () => void
  }
  Marker: new (options: Record<string, unknown>) => {
    setPosition: (position: number[]) => void
    setMap: (map: unknown) => void
  }
  Geolocation: new (options: Record<string, unknown>) => {
    getCurrentPosition: (callback: Callback) => void
  }
  Geocoder: new (options?: Record<string, unknown>) => {
    getAddress: (position: number[], callback: Callback) => void
  }
  PlaceSearch: new (options: Record<string, unknown>) => {
    search: (keyword: string, callback: Callback) => void
    searchNearBy: (keyword: string, center: number[], radius: number, callback: Callback) => void
  }
}

let sdkPromise: Promise<AMapSDK> | undefined
let loadedKey = ''

/** Only the public Web JS API key / JS security code belong here, never a REST service secret. */
export function loadAMap(key: string, securityCode: string): Promise<AMapSDK> {
  if (!key.trim()) return Promise.reject(new Error('AMAP_KEY_MISSING'))
  const identity = `${key.trim()}:${securityCode.trim()}`
  if (sdkPromise && loadedKey === identity) return sdkPromise
  if (sdkPromise) return Promise.reject(new Error('AMAP_RELOAD_REQUIRED'))
  loadedKey = identity
  const mapWindow = window as typeof window & {
    AMap?: AMapSDK
    _AMapSecurityConfig?: { securityJsCode: string }
  }
  mapWindow._AMapSecurityConfig = { securityJsCode: securityCode.trim() }
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = window.setTimeout(() => fail(), 20000)
    const fail = () => {
      clearTimeout(timer)
      script.remove()
      sdkPromise = undefined
      reject(new Error('AMAP_LOAD_FAILED'))
    }
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key.trim())}&plugin=AMap.Geolocation,AMap.Geocoder,AMap.PlaceSearch`
    script.async = true
    script.onerror = fail
    script.onload = () => {
      const sdk = mapWindow.AMap
      if (!sdk) {
        fail()
        return
      }
      sdk.plugin(['AMap.Geolocation', 'AMap.Geocoder', 'AMap.PlaceSearch'], () => {
        clearTimeout(timer)
        resolve(sdk)
      })
    }
    document.head.append(script)
  })
  return sdkPromise
}

function transform(x: number, y: number): Coordinate {
  const pi = Math.PI
  let lat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  let lng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  const wave = ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3
  lat += wave + ((20 * Math.sin(y * pi) + 40 * Math.sin((y / 3) * pi)) * 2) / 3
  lat += ((160 * Math.sin((y / 12) * pi) + 320 * Math.sin((y * pi) / 30)) * 2) / 3
  lng += wave + ((20 * Math.sin(x * pi) + 40 * Math.sin((x / 3) * pi)) * 2) / 3
  lng += ((150 * Math.sin((x / 12) * pi) + 300 * Math.sin((x / 30) * pi)) * 2) / 3
  return { lat, lng }
}

/** Existing Ech0 coordinates remain WGS84; AMap displays GCJ02 coordinates. */
export function toGCJ02(p: Coordinate): Coordinate {
  if (p.lng < 72.004 || p.lng > 137.8347 || p.lat < 0.8293 || p.lat > 55.8271) return { ...p }
  const delta = transform(p.lng - 105, p.lat - 35)
  const rad = (p.lat / 180) * Math.PI
  const magic = 1 - 0.006693421622965943 * Math.sin(rad) ** 2
  return {
    lat:
      p.lat +
      (delta.lat * 180) /
        (((6378245 * (1 - 0.006693421622965943)) / (magic * Math.sqrt(magic))) * Math.PI),
    lng: p.lng + (delta.lng * 180) / ((6378245 / Math.sqrt(magic)) * Math.cos(rad) * Math.PI),
  }
}

export function toWGS84(p: Coordinate): Coordinate {
  let estimate = { ...p }
  for (let i = 0; i < 5; i++) {
    const converted = toGCJ02(estimate)
    estimate = {
      lat: estimate.lat + p.lat - converted.lat,
      lng: estimate.lng + p.lng - converted.lng,
    }
  }
  return estimate
}

export const readPosition = (p: MapPosition): Coordinate => ({ lat: p.getLat(), lng: p.getLng() })

function serviceRequest(run: (callback: Callback) => void): Promise<ServiceResult> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('AMAP_TIMEOUT')), 18000)
    run((status, result) => {
      clearTimeout(timer)
      if (status === 'complete' || status === 'no_data') resolve(result)
      else reject(new Error(result.info || result.message || 'AMAP_SERVICE_FAILED'))
    })
  })
}

export async function locate(sdk: AMapSDK) {
  const result = await serviceRequest((cb) =>
    new sdk.Geolocation({
      enableHighAccuracy: true,
      timeout: 12000,
      needAddress: true,
      GeoLocationFirst: true,
      convert: true,
    }).getCurrentPosition(cb),
  )
  // Never publish a city inferred from an IP address as the user's exact position.
  if (!result.position || /ip/i.test(result.location_type || ''))
    throw new Error('AMAP_APPROXIMATE_ONLY')
  return { position: toWGS84(readPosition(result.position)), name: result.formattedAddress || '' }
}

export async function searchPlaces(
  sdk: AMapSDK,
  keyword: string,
  center?: Coordinate | null,
): Promise<Place[]> {
  const search = new sdk.PlaceSearch({ pageSize: 10, extensions: 'base', sortrule: 'distance' })
  const result = await serviceRequest((cb) => {
    if (center) {
      // Stored locations are WGS84; the nearby service requires GCJ02.
      // Never fall back to a different city's results when no nearby POIs match.
      const gcj = toGCJ02(center)
      search.searchNearBy(keyword, [gcj.lng, gcj.lat], 10000, cb)
    } else {
      search.search(keyword, cb)
    }
  })
  return (result.poiList?.pois || [])
    .filter((p) => p.location)
    .map((p) => ({
      id: p.id,
      name: p.name,
      address: typeof p.address === 'string' ? p.address : '',
      position: toWGS84(readPosition(p.location)),
    }))
}

export async function reverseAddress(sdk: AMapSDK, p: Coordinate): Promise<string> {
  const gcj = toGCJ02(p)
  const result = await serviceRequest((cb) => new sdk.Geocoder().getAddress([gcj.lng, gcj.lat], cb))
  return result.regeocode?.formattedAddress || ''
}
