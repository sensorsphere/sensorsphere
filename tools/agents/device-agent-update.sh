#!/bin/bash
script_dir=$(dirname "$0")

export AGENT_NAME="device-agent"

"$script_dir/common-agent-update.sh" $@