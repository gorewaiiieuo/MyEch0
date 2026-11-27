#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
set -eu
BASE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
command -v docker >/dev/null
command -v flock >/dev/null
command -v crontab >/dev/null
[ -f "$BASE/.env" ] || { printf '%s\n' 'Create .env first.' >&2; exit 1; }
case "$BASE" in *[!a-zA-Z0-9_./-]*) printf '%s\n' 'Use an installation path containing only letters, digits, /, _, - and .' >&2; exit 1 ;; esac
docker compose --project-directory "$BASE" --env-file "$BASE/.env" -f "$BASE/compose.yml" config -q
# First complete a real update check. A broken setup is never silently scheduled.
sh "$BASE/update.sh"
TMP=$(mktemp "$BASE/.cron.XXXXXX")
trap 'rm -f -- "$TMP"' EXIT HUP INT TERM
{ crontab -l 2>/dev/null || true; } | grep -Fv "# MyEch0:$BASE" > "$TMP" || true
printf '*/10 * * * * /bin/sh %s/update.sh >> %s/update.log 2>&1 # MyEch0:%s\n' "$BASE" "$BASE" "$BASE" >> "$TMP"
crontab "$TMP"
printf '%s\n' 'Automatic checks enabled: every 10 minutes. Logs: '"$BASE/update.log"
