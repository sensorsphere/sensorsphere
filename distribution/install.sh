#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_INSTALL_DIR="/opt/sensorsphere"
DEFAULT_RELEASE_BASE_URL="https://github.com/sensorsphere/sensorsphere/releases/download"

COMMAND="${1:-}"
[[ -n "$COMMAND" ]] || { echo "Usage: $0 <install|update|rollback|remove|status> [options]" >&2; exit 2; }
shift || true

INSTALL_DIR="${SENSORSPHERE_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
STACK_VERSION=""
MANIFEST_SOURCE=""
RELEASE_BASE_URL="${SENSORSPHERE_RELEASE_BASE_URL:-$DEFAULT_RELEASE_BASE_URL}"
SKIP_PULL=0
FORCE_ROLLBACK=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --stack) STACK_VERSION="$2"; shift 2 ;;
    --manifest) MANIFEST_SOURCE="$2"; shift 2 ;;
    --release-base-url) RELEASE_BASE_URL="$2"; shift 2 ;;
    --skip-pull) SKIP_PULL=1; shift ;;
    --force) FORCE_ROLLBACK=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

require_tools() {
  command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is required" >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose is required" >&2; exit 1; }
}

compose() {
  (cd "$INSTALL_DIR" && docker compose --env-file .env -f docker-compose.yml "$@")
}

set_env() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  grep -v "^${key}=" "$file" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

apply_environment_overrides() {
  local key
  for key in \
    SENSORSPHERE_ENVIRONMENT \
    INSTANCE_NAME \
    INSTANCE_NAME_COLOR \
    WEB_PORT \
    MQTT_PORT \
    SENSORSPHERE_PROJECT_TODOS_ENABLED \
    SENSORSPHERE_AUTH_ENABLED \
    SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED \
    SENSORSPHERE_AUTH_DEV_DEFAULT_ROLE \
    SENSORSPHERE_AUTH_PROVIDERS \
    SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL \
    SENSORSPHERE_PUBLIC_URL \
    SENSORSPHERE_GOOGLE_CLIENT_ID \
    SENSORSPHERE_GOOGLE_CLIENT_SECRET \
    SENSORSPHERE_MICROSOFT_CLIENT_ID \
    SENSORSPHERE_MICROSOFT_CLIENT_SECRET \
    SENSORSPHERE_MICROSOFT_TENANT; do
    if [[ -n "${!key+x}" ]]; then
      set_env "$INSTALL_DIR/.env" "$key" "${!key}"
    fi
  done
}

get_env() {
  local file="$1" key="$2"
  sed -n "s/^$key=//p" "$file" | tail -1
}

bool_true() {
  [[ "${1,,}" =~ ^(1|true|yes|on)$ ]]
}

configure_and_validate_auth() {
  local env_name auth_enabled providers public_url bootstrap provider
  env_name="$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_ENVIRONMENT)"
  env_name="${env_name:-DEFAULT}"
  env_name="${env_name^^}"

  auth_enabled="$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_AUTH_ENABLED)"
  if [[ -z "$auth_enabled" ]]; then
    if [[ "$env_name" == "DEV" ]]; then
      auth_enabled="false"
    else
      auth_enabled="true"
    fi
    set_env "$INSTALL_DIR/.env" SENSORSPHERE_AUTH_ENABLED "$auth_enabled"
  fi

  if [[ "$env_name" != "DEV" ]] && ! bool_true "$auth_enabled"; then
    echo "ERROR: authentication cannot be disabled when SENSORSPHERE_ENVIRONMENT=$env_name" >&2
    echo "Use SENSORSPHERE_ENVIRONMENT=DEV for an explicitly unauthenticated development instance." >&2
    exit 1
  fi

  if ! bool_true "$auth_enabled"; then
    return 0
  fi

  public_url="$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_PUBLIC_URL)"
  bootstrap="$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL)"
  providers="$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_AUTH_PROVIDERS)"
  if [[ -z "$providers" ]]; then
    providers="google"
    set_env "$INSTALL_DIR/.env" SENSORSPHERE_AUTH_PROVIDERS "$providers"
  fi

  [[ "$public_url" =~ ^https://[^/]+(:[0-9]+)?$ ]] || {
    echo "ERROR: SENSORSPHERE_PUBLIC_URL must be the public HTTPS origin when authentication is enabled (for example https://fit.example.com)." >&2
    exit 1
  }
  [[ -n "$bootstrap" ]] || {
    echo "ERROR: SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL is required for an auth-enabled installation." >&2
    exit 1
  }

  IFS=',' read -r -a auth_providers <<< "$providers"
  [[ "${#auth_providers[@]}" -gt 0 ]] || {
    echo "ERROR: SENSORSPHERE_AUTH_PROVIDERS must contain google and/or microsoft." >&2
    exit 1
  }

  for provider in "${auth_providers[@]}"; do
    provider="${provider//[[:space:]]/}"
    case "$provider" in
      google)
        [[ -n "$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_GOOGLE_CLIENT_ID)" &&
           -n "$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_GOOGLE_CLIENT_SECRET)" ]] || {
          echo "ERROR: Google is enabled but SENSORSPHERE_GOOGLE_CLIENT_ID / SENSORSPHERE_GOOGLE_CLIENT_SECRET are incomplete." >&2
          exit 1
        }
        ;;
      microsoft)
        [[ -n "$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_MICROSOFT_CLIENT_ID)" &&
           -n "$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_MICROSOFT_CLIENT_SECRET)" ]] || {
          echo "ERROR: Microsoft is enabled but SENSORSPHERE_MICROSOFT_CLIENT_ID / SENSORSPHERE_MICROSOFT_CLIENT_SECRET are incomplete." >&2
          exit 1
        }
        ;;
      *)
        echo "ERROR: unsupported OIDC provider '$provider' in SENSORSPHERE_AUTH_PROVIDERS." >&2
        exit 1
        ;;
    esac
  done
}

component_value() {
  local manifest="$1" component="$2"
  awk -v wanted="$component" '
    /^  [A-Za-z0-9_-]+:$/ { current=$1; sub(/:$/, "", current) }
    current == wanted && /^    version:/ { print $2; exit }
  ' "$manifest"
}

component_metadata_value() {
  local manifest="$1" component="$2" field="$3"
  awk -v wanted="$component" -v field="$field" '
    /^  [A-Za-z0-9_-]+:$/ { current=$1; sub(/:$/, "", current) }
    current == wanted && $1 == field ":" { print $2; exit }
  ' "$manifest"
}

compatibility_value() {
  local manifest="$1" key="$2"
  awk -v key="$key" '
    /^compatibility:$/ { inside=1; next }
    inside && /^[^ ]/ { exit }
    inside && $1 == key ":" { print $2; exit }
  ' "$manifest"
}
manifest_top_value() {
  local manifest="$1" key="$2"
  awk -v key="$key" '$1 == key ":" { print $2; exit }' "$manifest"
}

prepare_bundle() {
  mkdir -p "$INSTALL_DIR/config/mosquitto" "$INSTALL_DIR/init/timescaledb"

  if [[ "$(readlink -f "$SCRIPT_DIR")" != "$(readlink -f "$INSTALL_DIR")" ]]; then
    cp "$SCRIPT_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
    cp "$SCRIPT_DIR/install.sh" "$INSTALL_DIR/install.sh"
    chmod 0755 "$INSTALL_DIR/install.sh"
    cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env.example"
    cp "$SCRIPT_DIR/config/mosquitto/mosquitto.conf" "$INSTALL_DIR/config/mosquitto/mosquitto.conf"
    cp "$SCRIPT_DIR/init/timescaledb/01-init.sql" "$INSTALL_DIR/init/timescaledb/01-init.sql"
  fi

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env"
    local password
    password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
    set_env "$INSTALL_DIR/.env" POSTGRES_PASSWORD "$password"
  fi

  apply_environment_overrides
  configure_and_validate_auth
}

snapshot_bundle() {
  local destination="$1"
  rm -rf "$destination"
  mkdir -p "$destination"

  local file
  for file in docker-compose.yml install.sh .env.example; do
    if [[ -f "$INSTALL_DIR/$file" ]]; then
      cp "$INSTALL_DIR/$file" "$destination/$file"
    fi
  done

  [[ -d "$INSTALL_DIR/config" ]] && cp -a "$INSTALL_DIR/config" "$destination/config"
  [[ -d "$INSTALL_DIR/init" ]] && cp -a "$INSTALL_DIR/init" "$destination/init"
}

restore_bundle() {
  local source="$1"
  [[ -d "$source" ]] || return 0

  local file
  for file in docker-compose.yml install.sh .env.example; do
    if [[ -f "$source/$file" ]]; then
      cp "$source/$file" "$INSTALL_DIR/$file"
    fi
  done

  if [[ -d "$source/config" ]]; then
    rm -rf "$INSTALL_DIR/config"
    cp -a "$source/config" "$INSTALL_DIR/config"
  fi
  if [[ -d "$source/init" ]]; then
    rm -rf "$INSTALL_DIR/init"
    cp -a "$source/init" "$INSTALL_DIR/init"
  fi
  chmod 0755 "$INSTALL_DIR/install.sh" 2>/dev/null || true
}

fetch_manifest() {
  local destination="$1"

  if [[ -n "$MANIFEST_SOURCE" ]]; then
    cp "$MANIFEST_SOURCE" "$destination"
    return
  fi

  if [[ -z "$STACK_VERSION" && -f "$SCRIPT_DIR/stack-release.yaml" ]]; then
    cp "$SCRIPT_DIR/stack-release.yaml" "$destination"
    return
  fi

  [[ -n "$STACK_VERSION" ]] || {
    echo "ERROR: --stack is required when no manifest is bundled or supplied" >&2
    exit 2
  }

  local url="$RELEASE_BASE_URL/stack-$STACK_VERSION/$STACK_VERSION.yaml"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
  else
    echo "ERROR: curl or wget is required to download Stack Releases" >&2
    exit 1
  fi
}

apply_manifest() {
  local manifest="$1"
  local stack schema api frontend ingestion nginx migrations db_level nginx_released_at migrations_released_at

  stack="$(manifest_top_value "$manifest" stackVersion)"
  schema="$(manifest_top_value "$manifest" schemaVersion)"
  api="$(component_value "$manifest" api)"
  frontend="$(component_value "$manifest" frontend)"
  ingestion="$(component_value "$manifest" ingestion)"
  nginx="$(component_value "$manifest" nginx)"
  migrations="$(component_value "$manifest" migrations)"
  nginx_released_at="$(component_metadata_value "$manifest" nginx releasedAt)"
  migrations_released_at="$(component_metadata_value "$manifest" migrations releasedAt)"
  db_level="$(awk '$1 == "migrationLevel:" { print $2; exit }' "$manifest")"

  [[ "$schema" == "2" || "$schema" == "3" ]] || {
    echo "ERROR: installation requires Stack Release schemaVersion 2 or 3" >&2
    exit 1
  }
  [[ -n "$stack" && -n "$api" && -n "$frontend" && -n "$ingestion" && -n "$nginx" && -n "$migrations" ]]     || { echo "ERROR: incomplete Stack Release manifest" >&2; exit 1; }
  [[ "$migrations" == "$db_level" ]]     || { echo "ERROR: migrations version and database migrationLevel differ" >&2; exit 1; }

  if [[ -n "$STACK_VERSION" && "$stack" != "$STACK_VERSION" ]]; then
    echo "ERROR: manifest stackVersion $stack does not match requested $STACK_VERSION" >&2
    exit 1
  fi

  set_env "$INSTALL_DIR/.env" SENSORSPHERE_STACK_VERSION "$stack"
  set_env "$INSTALL_DIR/.env" SENSORSPHERE_API_VERSION "$api"
  set_env "$INSTALL_DIR/.env" SENSORSPHERE_FRONTEND_VERSION "$frontend"
  set_env "$INSTALL_DIR/.env" SENSORSPHERE_INGESTION_VERSION "$ingestion"
  set_env "$INSTALL_DIR/.env" SENSORSPHERE_NGINX_VERSION "$nginx"
  set_env "$INSTALL_DIR/.env" SENSORSPHERE_MIGRATIONS_VERSION "$migrations"
  if [[ -n "$nginx_released_at" ]]; then
    set_env "$INSTALL_DIR/.env" SENSORSPHERE_NGINX_RELEASED_AT "$nginx_released_at"
  fi
  if [[ -n "$migrations_released_at" ]]; then
    set_env "$INSTALL_DIR/.env" SENSORSPHERE_MIGRATIONS_RELEASED_AT "$migrations_released_at"
  fi

  if [[ "$schema" == "3" ]]; then
    local api_contract db_min db_max
    api_contract="$(compatibility_value "$manifest" apiContractVersion)"
    db_min="$(compatibility_value "$manifest" databaseMinMigrationLevel)"
    db_max="$(compatibility_value "$manifest" databaseMaxMigrationLevel)"

    [[ "$api_contract" =~ ^[0-9]+$ && "$db_min" =~ ^[0-9]+$ && "$db_max" =~ ^[0-9]+$ ]]       || { echo "ERROR: invalid compatibility metadata" >&2; exit 1; }
    (( db_min <= migrations && migrations <= db_max ))       || { echo "ERROR: migration level $migrations is outside API DB compatibility range $db_min..$db_max" >&2; exit 1; }

    set_env "$INSTALL_DIR/.env" SENSORSPHERE_API_CONTRACT_VERSION "$api_contract"
    set_env "$INSTALL_DIR/.env" SENSORSPHERE_DB_MIN_MIGRATION_LEVEL "$db_min"
    set_env "$INSTALL_DIR/.env" SENSORSPHERE_DB_MAX_MIGRATION_LEVEL "$db_max"
  fi
}
wait_for_health() {
  local deadline=$((SECONDS + 180))
  local service id status

  for service in timescaledb api frontend nginx; do
    while true; do
      id="$(compose ps -q "$service")"
      status=""
      if [[ -n "$id" ]]; then
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      fi

      if [[ "$status" == "healthy" || "$status" == "running" ]]; then
        echo "Health OK: $service ($status)"
        break
      fi

      if (( SECONDS >= deadline )); then
        echo "ERROR: health timeout for $service (status=$status)" >&2
        compose ps -a >&2 || true
        return 1
      fi
      sleep 2
    done
  done

  local migrations_id migrations_exit
  migrations_id="$(compose ps -aq migrations | head -1)"
  [[ -n "$migrations_id" ]] || { echo "ERROR: migrations container missing" >&2; return 1; }
  migrations_exit="$(docker inspect --format '{{.State.ExitCode}}' "$migrations_id")"
  [[ "$migrations_exit" == "0" ]] || { echo "ERROR: migrations exited with $migrations_exit" >&2; return 1; }
}

run_stack() {
  if [[ "$SKIP_PULL" -eq 0 ]]; then
    compose pull
  fi

  compose up -d
  wait_for_health
}

install_command() {
  require_tools
  [[ ! -e "$INSTALL_DIR/.installed" ]] || {
    echo "ERROR: $INSTALL_DIR already contains an installation; use update" >&2
    exit 1
  }

  prepare_bundle
  fetch_manifest "$INSTALL_DIR/.stack-release.yaml"
  apply_manifest "$INSTALL_DIR/.stack-release.yaml"
  run_stack
  date -u +%Y-%m-%dT%H:%M:%SZ > "$INSTALL_DIR/.installed"
  echo "Installed Stack Release $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_STACK_VERSION)"
}

update_command() {
  require_tools
  [[ -f "$INSTALL_DIR/.env" ]] || { echo "ERROR: installation not found: $INSTALL_DIR" >&2; exit 1; }

  cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.previous"
  [[ -f "$INSTALL_DIR/.stack-release.yaml" ]]     && cp "$INSTALL_DIR/.stack-release.yaml" "$INSTALL_DIR/.stack-release.previous.yaml"
  snapshot_bundle "$INSTALL_DIR/.bundle.previous"

  prepare_bundle
  fetch_manifest "$INSTALL_DIR/.stack-release.yaml"
  apply_manifest "$INSTALL_DIR/.stack-release.yaml"
  run_stack
  echo "Updated to Stack Release $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_STACK_VERSION)"
}
rollback_command() {
  require_tools
  [[ -f "$INSTALL_DIR/.env.previous" ]] || { echo "ERROR: no .env.previous rollback state" >&2; exit 1; }

  local current_migrations previous_migrations rollback_compatible
  current_migrations="$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_MIGRATIONS_VERSION)"
  previous_migrations="$(get_env "$INSTALL_DIR/.env.previous" SENSORSPHERE_MIGRATIONS_VERSION)"
  rollback_compatible=0

  if [[ "$current_migrations" == "$previous_migrations" ]]; then
    rollback_compatible=1
  elif [[ -f "$INSTALL_DIR/.stack-release.previous.yaml" ]]; then
    local previous_schema previous_db_min previous_db_max
    previous_schema="$(manifest_top_value "$INSTALL_DIR/.stack-release.previous.yaml" schemaVersion)"

    if [[ "$previous_schema" == "3" ]]; then
      previous_db_min="$(compatibility_value "$INSTALL_DIR/.stack-release.previous.yaml" databaseMinMigrationLevel)"
      previous_db_max="$(compatibility_value "$INSTALL_DIR/.stack-release.previous.yaml" databaseMaxMigrationLevel)"

      if [[ "$previous_db_min" =~ ^[0-9]+$ && "$previous_db_max" =~ ^[0-9]+$ ]]         && (( previous_db_min <= current_migrations && current_migrations <= previous_db_max )); then
        rollback_compatible=1
      fi
    fi
  fi

  if [[ "$rollback_compatible" -ne 1 && "$FORCE_ROLLBACK" -ne 1 ]]; then
    echo "ERROR: rollback blocked: previous stack does not declare compatibility with database migration level $current_migrations" >&2
    echo "Database migrations are not rolled back automatically. Re-run with --force only after verifying application/database compatibility." >&2
    exit 1
  fi

  cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.failed"
  snapshot_bundle "$INSTALL_DIR/.bundle.failed"
  cp "$INSTALL_DIR/.env.previous" "$INSTALL_DIR/.env"
  [[ -f "$INSTALL_DIR/.stack-release.previous.yaml" ]]     && cp "$INSTALL_DIR/.stack-release.previous.yaml" "$INSTALL_DIR/.stack-release.yaml"
  restore_bundle "$INSTALL_DIR/.bundle.previous"

  run_stack
  echo "Rolled back to Stack Release $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_STACK_VERSION)"
}

remove_command() {
  require_tools
  [[ -f "$INSTALL_DIR/.env" ]] || { echo "ERROR: installation not found: $INSTALL_DIR" >&2; exit 1; }
  compose down --remove-orphans
  rm -f "$INSTALL_DIR/.installed"
  echo "SensorSphere runtime removed. Data and configuration are preserved in $INSTALL_DIR"
}

status_command() {
  [[ -f "$INSTALL_DIR/.env" ]] || { echo "ERROR: installation not found: $INSTALL_DIR" >&2; exit 1; }
  echo "Install dir: $INSTALL_DIR"
  echo "Stack Release: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_STACK_VERSION)"
  echo "API: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_API_VERSION)"
  echo "Frontend: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_FRONTEND_VERSION)"
  echo "Ingestion: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_INGESTION_VERSION)"
  echo "nginx: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_NGINX_VERSION)"
  echo "Migrations: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_MIGRATIONS_VERSION)"
  if [[ -n "$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_API_CONTRACT_VERSION)" ]]; then
    echo "API contract: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_API_CONTRACT_VERSION)"
    echo "DB compatibility: $(get_env "$INSTALL_DIR/.env" SENSORSPHERE_DB_MIN_MIGRATION_LEVEL)..$(get_env "$INSTALL_DIR/.env" SENSORSPHERE_DB_MAX_MIGRATION_LEVEL)"
  fi
  compose ps -a
}

case "$COMMAND" in
  install) install_command ;;
  update) update_command ;;
  rollback) rollback_command ;;
  remove) remove_command ;;
  status) status_command ;;
  *) echo "Unknown command: $COMMAND" >&2; exit 2 ;;
esac
