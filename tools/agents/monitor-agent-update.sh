#!/bin/bash
script_dir=$(dirname "$0")

export AGENT_NAME="monitor-agent"

"$script_dir/common-agent-update.sh" $@