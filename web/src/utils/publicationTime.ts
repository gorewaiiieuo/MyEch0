// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ech0 local contributors

export type PublicationTime = { useNow: boolean; localTime: string }

/** datetime-local uses the browser's timezone, not UTC. Keep seconds on edits. */
export function formatLocalPublicationTime(milliseconds: number): string {
  const date = new Date(milliseconds)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function parseLocalPublicationTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null
  const milliseconds = new Date(value).getTime()
  const normalized = value.length === 16 ? `${value}:00` : value
  // Reject invalid calendar dates and local times skipped by daylight saving.
  if (!Number.isFinite(milliseconds) || formatLocalPublicationTime(milliseconds) !== normalized) {
    return null
  }
  const seconds = Math.floor(milliseconds / 1000)
  return seconds > 0 ? seconds : null
}
