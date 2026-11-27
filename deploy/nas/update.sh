#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Run from the NAS scheduler as a user with Docker and data backup permissions.
set -eu
umask 077
BASE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$BASE"
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
compose() { docker compose --project-directory "$BASE" --env-file "$BASE/.env" -f "$BASE/compose.yml" "$@"; }
fail() { log "ERROR: $*"; exit 1; }
[ -f "$BASE/.env" ] || fail 'Create .env from .env.example first.'
[ ! -e "$BASE/update.failed" ] || fail 'Previous update needs attention. Read update.failed before removing it.'

# flock releases the lock even after a reboot or a killed process.
command -v flock >/dev/null 2>&1 || fail 'flock is required to prevent overlapping updates.'
exec 9> "$BASE/.update.lock"
flock -n 9 || exit 0
compose config -q
CID=$(compose ps -q ech0)
[ -n "$CID" ] || fail 'No running ech0 service in this Compose project. Complete initial setup first.'
OLD_IMAGE=$(docker inspect --format '{{.Image}}' "$CID")
DATA_TYPE=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Type}}{{end}}{{end}}' "$CID")
DATA=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' "$CID")
[ "$DATA_TYPE" = bind ] || fail 'Automatic backup currently requires a bind-mounted data directory.'
case "$DATA" in /*/*) ;; *) fail 'Unsafe data directory.' ;; esac
[ -d "$DATA" ] || fail 'Data directory is missing.'
DATA=$(CDPATH= cd -- "$DATA" && pwd -P)
EXPECTED=$(compose config --environment | sed -n 's/^ECH0_DATA_DIR=//p')
[ -n "$EXPECTED" ] && [ -d "$EXPECTED" ] || fail 'ECH0_DATA_DIR does not exist.'
EXPECTED=$(CDPATH= cd -- "$EXPECTED" && pwd -P)
[ "$DATA" = "$EXPECTED" ] || fail 'Configured data directory differs from the running container.'
case "$BASE/" in "$DATA/"*) fail 'Keep the updater outside the data directory.' ;; esac
IMAGE=$(compose config --images)
[ -n "$IMAGE" ] || fail 'No image configured.'

# An unavailable registry leaves the current running service untouched.
compose pull ech0 || fail 'Image download failed; existing service was not stopped.'
NEW_IMAGE=$(docker image inspect --format '{{.Id}}' "$IMAGE")
if [ "$OLD_IMAGE" = "$NEW_IMAGE" ]; then
  log 'Already up to date.'
  exit 0
fi
STAMP=$(date -u '+%Y%m%dT%H%M%SZ')-$$
BACKUP="$BASE/backups/$STAMP"
mkdir -p "$BACKUP"
ROLLBACK="myech0-rollback:before-$STAMP"
docker tag "$OLD_IMAGE" "$ROLLBACK"
docker inspect "$CID" > "$BACKUP/container.json"
cp "$BASE/compose.yml" "$BASE/.env" "$BACKUP/"
printf '%s\n' "$ROLLBACK" > "$BACKUP/image.txt"
printf 'services:\n  ech0:\n    image: %s\n' "$ROLLBACK" > "$BASE/.rollback.yml"
PHASE=before_stop
rollback() {
  log 'Update did not become healthy; restoring the saved data and image.'
  compose stop ech0 || return 1
  FAILED_DATA="${DATA}.failed-$STAMP"
  [ ! -e "$FAILED_DATA" ] || return 1
  mv -- "$DATA" "$FAILED_DATA" || return 1
  mkdir -- "$DATA" || { mv -- "$FAILED_DATA" "$DATA"; return 1; }
  tar -xpf "$BACKUP/data.tar" -C "$DATA" || return 1
  docker compose --project-directory "$BASE" --env-file "$BASE/.env" \
    -f "$BASE/compose.yml" -f "$BASE/.rollback.yml" \
    up -d --no-build --pull never --force-recreate --wait --wait-timeout 120 ech0 || return 1
  log "Old version restored. Failed version's data retained at $FAILED_DATA"
}
cleanup() {
  rc=$?
  trap - EXIT HUP INT TERM
  case "$PHASE" in
    stopped) docker start "$CID" >/dev/null || true ;;
    deploying)
      printf 'Failed update at %s. Backup: %s\n' "$STAMP" "$BACKUP" > "$BASE/update.failed"
      if rollback; then
        printf 'Rollback succeeded. Inspect the failed release before removing this file.\n' >> "$BASE/update.failed"
      else
        printf 'Rollback failed. Do not delete the backup; manual recovery is required.\n' >> "$BASE/update.failed"
        log "ERROR: Rollback failed. Backup: $BACKUP"
      fi
      ;;
  esac
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
log "Updating $OLD_IMAGE -> $NEW_IMAGE"
compose stop ech0
PHASE=stopped
# Stop SQLite before copying its database, WAL and uploaded attachments together.
tar -cpf "$BACKUP/data.tar" -C "$DATA" .
tar -tf "$BACKUP/data.tar" >/dev/null
PHASE=deploying
compose up -d --no-build --pull never --force-recreate --wait --wait-timeout 120 ech0
PHASE=complete
printf '%s\n' "$NEW_IMAGE" > "$BACKUP/new-image.txt"
rm -f -- "$BASE/.rollback.yml"
log "Updated successfully. Backup kept at $BACKUP"
