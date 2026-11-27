// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

import { describe, expect, it, vi } from 'vitest'
import { locate, searchPlaces, toGCJ02, toWGS84, type AMapSDK } from '@/utils/amap'

describe('domestic map coordinates and services', () => {
  it('round-trips China coordinates without moving existing WGS84 content', () => {
    const wgs = { lat: 22.5176, lng: 113.3926 }
    const gcj = toGCJ02(wgs)
    expect(Math.abs(gcj.lng - wgs.lng)).toBeGreaterThan(0.001)
    expect(toWGS84(gcj).lat).toBeCloseTo(wgs.lat, 6)
    expect(toWGS84(gcj).lng).toBeCloseTo(wgs.lng, 6)
    expect(toGCJ02({ lat: 48.8584, lng: 2.2945 })).toEqual({ lat: 48.8584, lng: 2.2945 })
  })
  it('does not silently publish an IP-derived city as the current position', async () => {
    const sdk = {
      Geolocation: class {
        getCurrentPosition(cb: (status: string, value: unknown) => void) {
          cb('complete', {
            location_type: 'ip',
            position: { getLat: () => 22.5, getLng: () => 113.4 },
          })
        }
      },
    } as unknown as AMapSDK
    await expect(locate(sdk)).rejects.toThrow('AMAP_APPROXIMATE_ONLY')
  })
  it('converts a selected search result back to the stored coordinate system', async () => {
    const sdk = {
      PlaceSearch: class {
        search(_keyword: string, cb: (status: string, value: unknown) => void) {
          cb('complete', {
            poiList: {
              pois: [
                {
                  id: 'a',
                  name: 'Port',
                  address: 'Zhongshan',
                  location: { getLat: () => 22.5, getLng: () => 113.4 },
                },
              ],
            },
          })
        }
      },
    } as unknown as AMapSDK
    const result = await searchPlaces(sdk, 'Port')
    expect(result[0]?.name).toBe('Port')
    expect(toGCJ02(result[0]!.position).lng).toBeCloseTo(113.4, 6)
  })
  it('searches around the selected location instead of the default city', async () => {
    const center = { lat: 22.27, lng: 113.57 }
    const options = vi.fn()
    const globalSearch = vi.fn()
    const nearbySearch = vi.fn((_keyword, _center, _radius, cb) =>
      cb('complete', { poiList: { pois: [] } }),
    )
    const sdk = {
      PlaceSearch: class {
        constructor(config: Record<string, unknown>) {
          options(config)
        }
        search = globalSearch
        searchNearBy = nearbySearch
      },
    } as unknown as AMapSDK
    await expect(searchPlaces(sdk, '麦当劳', center)).resolves.toEqual([])
    const gcj = toGCJ02(center)
    expect(nearbySearch).toHaveBeenCalledWith(
      '麦当劳',
      [gcj.lng, gcj.lat],
      10000,
      expect.any(Function),
    )
    expect(options).toHaveBeenCalledWith(expect.objectContaining({ sortrule: 'distance' }))
    expect(globalSearch).not.toHaveBeenCalled()
  })
  it('keeps an empty nearby search empty rather than returning distant matches', async () => {
    const globalSearch = vi.fn()
    const sdk = {
      PlaceSearch: class {
        search = globalSearch
        searchNearBy(
          _keyword: string,
          _center: number[],
          _radius: number,
          cb: (status: string, value: unknown) => void,
        ) {
          cb('no_data', { info: 'NO_DATA' })
        }
      },
    } as unknown as AMapSDK
    await expect(searchPlaces(sdk, '没有的地点', { lat: 22.27, lng: 113.57 })).resolves.toEqual([])
    expect(globalSearch).not.toHaveBeenCalled()
  })
})
