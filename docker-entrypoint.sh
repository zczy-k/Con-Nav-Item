#!/bin/sh
set -eu

APP_ROOT="/app"
DB_DIR="${APP_ROOT}/database"
BACKUP_DIR="${APP_ROOT}/backups"
CONFIG_DIR="${APP_ROOT}/config"
DEFAULT_CONFIG_DIR="${APP_ROOT}/defaults/config"
WEB_DIST_DIR="${APP_ROOT}/web/dist"
DB_FILE="${DB_DIR}/nav.db"

log() {
    echo "[entrypoint] $*"
}

ensure_dir() {
    dir="$1"
    mkdir -p "$dir"
    chmod 755 "$dir" 2>/dev/null || true
}

ensure_writable() {
    dir="$1"
    probe="${dir}/.write-test.$$"

    if touch "$probe" 2>/dev/null; then
        rm -f "$probe"
        log "Writable: $dir"
    else
        log "ERROR: $dir is not writable. Check your volume mount or platform persistent storage settings."
        exit 1
    fi
}

bootstrap_config() {
    if [ ! -d "$DEFAULT_CONFIG_DIR" ]; then
        return
    fi

    for file in "$DEFAULT_CONFIG_DIR"/*; do
        [ -e "$file" ] || continue
        base="$(basename "$file")"
        target="${CONFIG_DIR}/${base}"
        if [ ! -e "$target" ]; then
            cp "$file" "$target"
            log "Bootstrapped config file: ${target}"
        fi
    done
}

log "Starting Con-Nav-Item"

ensure_dir "$DB_DIR"
ensure_dir "$BACKUP_DIR"
ensure_dir "$CONFIG_DIR"
ensure_dir "$WEB_DIST_DIR"

ensure_writable "$DB_DIR"
ensure_writable "$BACKUP_DIR"
ensure_writable "$CONFIG_DIR"

bootstrap_config

if [ -f "$DB_FILE" ]; then
    log "Existing SQLite database found at $DB_FILE"
else
    log "No SQLite database found at $DB_FILE"
    log "A new database will be initialized on first start."
    log "If you expected existing data, mount a persistent volume to /app/database."
fi

log "Runtime configuration:"
log "  PORT=${PORT:-3000}"
log "  NODE_ENV=${NODE_ENV:-production}"
log "  DATABASE_DIR=$DB_DIR"
log "  BACKUPS_DIR=$BACKUP_DIR"
log "  CONFIG_DIR=$CONFIG_DIR"
log "  AUTO_BACKUP_ENABLED=${AUTO_BACKUP_ENABLED:-true}"

exec "$@"
