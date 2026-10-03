#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REGISTRY="${SENSORSPHERE_IMAGE_REGISTRY:-ghcr.io}"
NAMESPACE="${SENSORSPHERE_IMAGE_NAMESPACE:-sensorsphere}"
PLATFORMS="linux/amd64,linux/arm64"
PUSH=1

if [[ -n "${PLATFORMS_OVERRIDE:-}" && "${PLATFORMS_OVERRIDE}" != "$PLATFORMS" ]]; then
  echo "ERROR: official releases require platforms: $PLATFORMS" >&2
  exit 2
fi

if [[ "${1:-}" == "--dry-run" ]]; then
  PUSH=0
  shift
fi

if [[ $# -gt 0 ]]; then
  MODULES=("$@")
else
  MODULES=(api frontend ingestion-service nginx migrations backup)
fi

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
docker buildx version >/dev/null 2>&1 || { echo "docker buildx is required" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git is required" >&2; exit 1; }

REVISION="$(git rev-parse HEAD)"
SHA_TAG="sha-$REVISION"
SOURCE="${OCI_SOURCE:-}"
if [[ -z "$SOURCE" ]]; then
  remote="$(git config --get remote.origin.url 2>/dev/null || true)"
  case "$remote" in
    git@github.com:*) remote="https://github.com/${remote#git@github.com:}" ;;
    ssh://git@github.com/*) remote="https://github.com/${remote#ssh://git@github.com/}" ;;
  esac
  SOURCE="${remote%.git}"
fi
[[ "$SOURCE" == https://github.com/* ]] || SOURCE="https://github.com/sensorsphere/sensorsphere"

module_version() {
  local file="$1"
  sed -n 's/^export const MODULE_VERSION = "\([^"]*\)";/\1/p' "$file"
}

plain_version() {
  tr -d '[:space:]' < "$1"
}

assert_tag_available() {
  local tag="$1"

  if docker buildx imagetools inspect "$tag" >/dev/null 2>&1; then
    echo "ERROR: immutable release tag already exists: $tag" >&2
    exit 1
  fi
}

for module in "${MODULES[@]}"; do
  case "$module" in
    api)
      dockerfile="apps/api/Dockerfile"
      version_file="apps/api/src/module_version.ts"
      image_name="sensorsphere-api"
      version_kind="module"
      ;;
    frontend)
      dockerfile="apps/frontend/Dockerfile"
      version_file="apps/frontend/src/module_version.ts"
      image_name="sensorsphere-frontend"
      version_kind="module"
      ;;
    ingestion-service|ingestion)
      dockerfile="apps/ingestion-service/Dockerfile"
      version_file="apps/ingestion-service/src/module_version.ts"
      image_name="sensorsphere-ingestion-service"
      version_kind="module"
      ;;
    nginx)
      dockerfile="infrastructure/nginx/Dockerfile"
      version_file="infrastructure/nginx/VERSION"
      image_name="sensorsphere-nginx"
      version_kind="semver"
      ;;
    migrations)
      dockerfile="infrastructure/timescaledb/migrations/Dockerfile"
      version_file="infrastructure/timescaledb/migrations/VERSION"
      image_name="sensorsphere-migrations"
      version_kind="integer"
      ;;
    backup)
      dockerfile="apps/backup/Dockerfile"
      version_file="apps/backup/VERSION"
      image_name="sensorsphere-backup"
      version_kind="semver"
      ;;
    *)
      echo "Unknown module: $module" >&2
      exit 2
      ;;
  esac

  case "$version_kind" in
    module)
      version="$(module_version "$version_file")"
      ;;
    semver|integer)
      version="$(plain_version "$version_file")"
      ;;
  esac

  if [[ "$version_kind" == "integer" ]]; then
    [[ "$version" =~ ^[0-9]+$ ]]       || { echo "Invalid version for $module: $version" >&2; exit 1; }
  else
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]       || { echo "Invalid version for $module: $version" >&2; exit 1; }
  fi

  image="$REGISTRY/$NAMESPACE/$image_name"
  args=(
    buildx build
    --platform "$PLATFORMS"
    --file "$dockerfile"
    --tag "$image:$version"
    --tag "$image:$SHA_TAG"
    --label "org.opencontainers.image.source=$SOURCE"
    --label "org.opencontainers.image.revision=$REVISION"
    --label "org.opencontainers.image.version=$version"
  )
  if [[ "$module" == "backup" ]]; then
    args+=(--build-arg "VCS_REF=$REVISION")
  fi

  if [[ "$PUSH" -eq 1 ]]; then
    assert_tag_available "$image:$version"
    assert_tag_available "$image:$SHA_TAG"
    args+=(--provenance=mode=max --sbom=true --push)
  else
    args+=(--output type=cacheonly)
  fi
  args+=(.)

  echo "Module:    $module"
  echo "Image:     $image"
  echo "Version:   $version"
  echo "Revision:  $REVISION"
  echo "Platforms: $PLATFORMS"

  if [[ "$PUSH" -eq 0 ]]; then
    printf 'DRY RUN: docker'
    printf ' %q' "${args[@]}"
    printf '\n'
    continue
  fi

  docker "${args[@]}"
  docker buildx imagetools inspect "$image:$version"
  docker buildx imagetools inspect "$image:$SHA_TAG"
done
