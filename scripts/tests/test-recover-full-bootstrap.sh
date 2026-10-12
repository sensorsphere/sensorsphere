#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

STACK="2099.01.01.1"
BACKUP_ID="20990101T000000Z-testfull"
RELEASE_ROOT="$TMP/releases"
BUNDLE="$TMP/offhost/$BACKUP_ID"
TARGET="$TMP/target"
ENV_FILE="$TMP/recovery.env"
FAKEBIN="$TMP/bin"
STAGE="$TMP/stage/sensorsphere-$STACK"

mkdir -p "$BUNDLE/instance" "$RELEASE_ROOT/stack-$STACK" "$FAKEBIN" "$STAGE"

cat > "$BUNDLE/manifest.json" <<JSON
{
  "backupId": "$BACKUP_ID",
  "verification": {"status": "VERIFIED"},
  "stack": {"stackVersion": "$STACK"},
  "instanceSecrets": {"included": false}
}
JSON

cat > "$BUNDLE/instance/installation.json" <<JSON
{
  "environment": "RECOVERY",
  "instanceName": "SensorSphere [SOURCE]",
  "composeProject": "source-project",
  "stackVersion": "$STACK",
  "instanceSecrets": {"included": false}
}
JSON

cat > "$BUNDLE/instance/stack-release.yaml" <<YAML
stackVersion: $STACK
schemaVersion: 4
components:
  api:
    version: 9.9.9
    image: ghcr.io/example/api:9.9.9
  backup:
    version: 9.9.9
    image: ghcr.io/example/backup:9.9.9
database:
  migrationLevel: 1
compatibility:
  apiContractVersion: 1
  frontendRequiredApiContractVersion: 1
  databaseMinMigrationLevel: 1
  databaseMaxMigrationLevel: 1
YAML

cat > "$BUNDLE/COMPLETE" <<EOF
backupId=$BACKUP_ID
completedAt=2099-01-01T00:00:00Z
formatVersion=1
EOF

(
  cd "$BUNDLE"
  : > checksums.sha256
  for f in manifest.json instance/installation.json instance/stack-release.yaml; do
    sha256sum "$f" >> checksums.sha256
  done
)

cp "$BUNDLE/instance/stack-release.yaml" "$STAGE/stack-release.yaml"

cat > "$STAGE/docker-compose.yml" <<'YAML'
services:
  test:
    image: alpine:3.20
YAML

cat > "$STAGE/install.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
COMMAND="$1"
shift
INSTALL_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --stack|--manifest)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
case "$COMMAND" in
  install)
    mkdir -p "$INSTALL_DIR"
    cp "$(dirname "$0")/install.sh" "$INSTALL_DIR/install.sh"
    cp "$(dirname "$0")/restore.sh" "$INSTALL_DIR/restore.sh"
    chmod 0755 "$INSTALL_DIR/install.sh" "$INSTALL_DIR/restore.sh"
    touch "$INSTALL_DIR/.installed"
    ;;
  status)
    echo "fake status ok"
    ;;
  *)
    exit 2
    ;;
esac
SH

cat > "$STAGE/restore.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "$(dirname "$0")/restore-invocation.txt"
SH

chmod 0755 "$STAGE/install.sh" "$STAGE/restore.sh"

(
  cd "$TMP/stage"
  tar -czf "$RELEASE_ROOT/stack-$STACK/sensorsphere-$STACK.tar.gz" "sensorsphere-$STACK"
)
(
  cd "$RELEASE_ROOT/stack-$STACK"
  sha256sum "sensorsphere-$STACK.tar.gz" > "sensorsphere-$STACK.tar.gz.sha256"
)

cat > "$FAKEBIN/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "manifest" && "$2" == "inspect" ]]; then
  exit 0
fi
echo "unexpected docker invocation: $*" >&2
exit 2
SH
chmod 0755 "$FAKEBIN/docker"

cat > "$ENV_FILE" <<'EOF'
COMPOSE_PROJECT_NAME=full-recovery-test
WEB_BIND_ADDRESS=127.0.0.1
WEB_PORT=29082
MQTT_BIND_ADDRESS=127.0.0.1
MQTT_PORT=12885
SENSORSPHERE_AUTH_ENABLED=false
EOF
chmod 0600 "$ENV_FILE"

RECOVER="$ROOT_DIR/recover.sh"
CONFIRM="FULL RESTORE $BACKUP_ID INTO $TARGET"

PATH="$FAKEBIN:$PATH" "$RECOVER"   --full "$BUNDLE"   --install-dir "$TARGET"   --env-file "$ENV_FILE"   --release-base-url "file://$RELEASE_ROOT"   --preflight-only > "$TMP/preflight.log"

[[ ! -e "$TARGET" ]] || {
  echo "preflight unexpectedly created target" >&2
  exit 1
}
grep -q 'Preflight READY' "$TMP/preflight.log"

PATH="$FAKEBIN:$PATH" "$RECOVER"   --full "$BUNDLE"   --install-dir "$TARGET"   --env-file "$ENV_FILE"   --release-base-url "file://$RELEASE_ROOT"   --unattended   --confirm "$CONFIRM" > "$TMP/recover.log"

grep -q '^POSTGRES_PASSWORD=.' "$TARGET/.env"
grep -q '^SENSORSPHERE_ENVIRONMENT=RECOVERY$' "$TARGET/.env"
grep -q '^INSTANCE_NAME=SensorSphere \[SOURCE\]$' "$TARGET/.env"
grep -q '^COMPOSE_PROJECT_NAME=full-recovery-test$' "$TARGET/.env"
grep -q -- "--data $BACKUP_ID --unattended --confirm RESTORE $BACKUP_ID INTO SensorSphere \[SOURCE\]" "$TARGET/restore-invocation.txt"
[[ -f "$TARGET/backups/$BACKUP_ID/COMPLETE" ]]
grep -q 'Full recovery SUCCESS' "$TMP/recover.log"

echo "Full recovery bootstrap test: PASS"
