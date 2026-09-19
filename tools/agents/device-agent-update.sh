#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd -P)"

export AGENT_NAME="device-agent"

exec "$script_dir/common-agent-update.sh" "$@"
