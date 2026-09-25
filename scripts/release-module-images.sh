#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REGISTRY="${SENSORSPHERE_IMAGE_REGISTRY:-ghcr.io}"
NAMESPACE="${SENSORSPHERE_IMAGE_NAMESPACE:-sensorsphere}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH=1

if [[ "${1:-}" == "--dry-run" ]]; then
  PUSH=0
  shift
fi

if [[ $# -gt 0 ]]; then
  MODULES=("$@")
else
  MODULES=(api frontend ingestion-service)
fi

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
docker buildx version >/dev/null 2>&1 || { echo "docker buildx is required" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git is required" >&2; exit 1; }

REVISION="$(git rev-parse HEAD)"
SHORT_REVISION="$(git rev-parse --short=7 HEAD)"
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

for module in "${MODULES[@]}"; do
  case "$module" in
    api)
      dockerfile="apps/api/Dockerfile"
      version_file="apps/api/src/module_version.ts"
      image_name="sensorsphere-api"
      ;;
    frontend)
      dockerfile="apps/frontend/Dockerfile"
      version_file="apps/frontend/src/module_version.ts"
      image_name="sensorsphere-frontend"
      ;;
    ingestion-service|ingestion)
      dockerfile="apps/ingestion-service/Dockerfile"
      version_file="apps/ingestion-service/src/module_version.ts"
      image_name="sensorsphere-ingestion-service"
      ;;
    *)
      echo "Unknown module: $module" >&2
      exit 2
      ;;
  esac

  version="$(module_version "$version_file")"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]     || { echo "Invalid version for $module: $version" >&2; exit 1; }

  image="$REGISTRY/$NAMESPACE/$image_name"
  args=(
    buildx build
    --platform "$PLATFORMS"
    --file "$dockerfile"
    --tag "$image:$version"
    --tag "$image:sha-$SHORT_REVISION"
    --label "org.opencontainers.image.source=$SOURCE"
    --label "org.opencontainers.image.revision=$REVISION"
    --label "org.opencontainers.image.version=$version"
  )

  if [[ "$PUSH" -eq 1 ]]; then
    args+=(--push)
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
  docker buildx imagetools inspect "$image:sha-$SHORT_REVISION"
done
