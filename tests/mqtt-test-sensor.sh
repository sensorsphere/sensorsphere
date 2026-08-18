#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd
)"

VALUES_FILE="${VALUES_FILE:-$SCRIPT_DIR/mqtt-test-sensor.env}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-15}"

usage() {
  cat <<'EOF'
Usage:
  ./mqtt-test-sensor.sh [interval_seconds] [values_file]

Examples:
  ./mqtt-test-sensor.sh
  ./mqtt-test-sensor.sh 5
  ./mqtt-test-sensor.sh 10 ./mqtt-test-sensor.env

Environment overrides:
  INTERVAL_SECONDS=15
  VALUES_FILE=/path/to/mqtt-test-sensor.env

Metric lines can be disabled by prefixing them with # or ;.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  INTERVAL_SECONDS="$1"
fi

if [[ -n "${2:-}" ]]; then
  VALUES_FILE="$2"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not in PATH." >&2
  exit 1
fi

if ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "ERROR: invalid interval: $INTERVAL_SECONDS" >&2
  exit 1
fi

declare -A METRIC_TOPICS=(
  [HUMIDITY_VALUE]="humidity"
  [TEMPERATURE_VALUE]="temperature"
  [BATTERY_LEVEL_VALUE]="battery_level"
  [BATTERY_VOLTAGE_VALUE]="battery_voltage"
  [RSSI_VALUE]="rssi"
)

load_values_file() {
  local line
  local key
  local value

  # Defaults are reset on every loop.
  MQTT_HOST="100.64.0.9"
  MQTT_PORT="1883"
  MQTT_USERNAME=""
  MQTT_PASSWORD=""
  MQTT_RETAIN="false"
  MQTT_TOPIC_PREFIX="sensors/ble_gateway/sensor"
  SENSOR_UID="11_22_33"

  # Clear metric values so a metric commented out between two loops
  # immediately stops being published.
  for key in "${!METRIC_TOPICS[@]}"; do
    unset "$key"
  done

  while IFS= read -r line || [[ -n "$line" ]]; do

    # Remove CR when the file was edited with Windows line endings.
    line="${line%$'\r'}"

    # Trim leading whitespace.
    line="${line#"${line%%[![:space:]]*}"}"

    # Empty lines and comments are ignored.
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue
    [[ "$line" == \;* ]] && continue

    # Only accept KEY=VALUE assignments.
    if [[ "$line" != *=* ]]; then
      echo "WARNING: ignored invalid line: $line" >&2
      continue
    fi

    key="${line%%=*}"
    value="${line#*=}"

    # Trim whitespace around key.
    key="${key%"${key##*[![:space:]]}"}"

    if ! [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      echo "WARNING: ignored invalid variable name: $key" >&2
      continue
    fi

    # Trim surrounding whitespace from value.
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    # Strip simple matching single/double quotes.
    if [[ ${#value} -ge 2 ]]; then
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi

    printf -v "$key" '%s' "$value"

  done < "$VALUES_FILE"
}

publish_metric() {
  local variable="$1"
  local metric="$2"
  local value="${!variable-}"

  # Variable absente = métrique désactivée avec # ou ;
  if [[ ! -v "$variable" ]]; then
    return 0
  fi

  local topic="${MQTT_TOPIC_PREFIX}/${metric}_${SENSOR_UID}/state"

  printf '%s  %-16s = %-10s -> %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$metric" \
    "$value" \
    "$topic"

  local args=(
    mosquitto_pub
    -h "$MQTT_HOST"
    -p "$MQTT_PORT"
    -t "$topic"
    -m "$value"
  )

  if [[ "$MQTT_RETAIN" == "true" ]]; then
    args+=(-r)
  fi

  if [[ -n "$MQTT_USERNAME" ]]; then
    args+=(-u "$MQTT_USERNAME")
  fi

  if [[ -n "$MQTT_PASSWORD" ]]; then
    args+=(-P "$MQTT_PASSWORD")
  fi

  if ! docker run --rm \
    eclipse-mosquitto:latest \
    "${args[@]}"
  then
    echo "ERROR: MQTT publish failed for $metric" >&2
  fi
}

echo "MQTT fictitious sensor publisher"
echo "Values file : $VALUES_FILE"
echo "Interval    : ${INTERVAL_SECONDS}s"
echo
echo "Prefix a metric with # or ; to stop publishing it."
echo "Press Ctrl+C to stop."
echo

while true; do

  if [[ ! -f "$VALUES_FILE" ]]; then
    echo "ERROR: values file not found: $VALUES_FILE" >&2
    sleep "$INTERVAL_SECONDS"
    continue
  fi

  load_values_file

  publish_metric "HUMIDITY_VALUE"        "humidity"
  publish_metric "TEMPERATURE_VALUE"     "temperature"
  publish_metric "BATTERY_LEVEL_VALUE"   "battery_level"
  publish_metric "BATTERY_VOLTAGE_VALUE" "battery_voltage"
  publish_metric "RSSI_VALUE"            "rssi"

  sleep "$INTERVAL_SECONDS"

done
