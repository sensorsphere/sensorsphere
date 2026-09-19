#!/bin/bash
set -uo pipefail

printf -- '-%s-\n' "$*"

# expected env. var. $AGENT_NAME
if [[ -z "${AGENT_NAME:-}" ]]; then
  echo "Error: AGENT_NAME environment variable is not set. Please set it to the name of the agent (e.g., 'device-agent' or 'monitoring-agent')."
  exit 1
fi

SSH_SERVER="${1:-}"
AGENT_VERSION="${2:-}"

printf 'SSH_SERVER or File: %s\n' "$SSH_SERVER"
printf 'AGENT_NAME        : %s\n' "$AGENT_NAME"
printf 'AGENT_VERSION     : %s\n' "$AGENT_VERSION"

if [[ -z "$SSH_SERVER" || -z "$AGENT_VERSION" ]]; then
  echo "Usage: $0 <ssh-server or agents-file> <agent-version>"
  exit 1
fi

if [[ -f "$SSH_SERVER" ]]; then
  mapfile -t instances < "$SSH_SERVER"
else
  instances=("$SSH_SERVER")
fi

TOTAL_LINES=${#instances[@]}
echo -e "====>>>> Updating \x1b[34m${AGENT_NAME}\x1b[0m on \x1b[32m$TOTAL_LINES\x1b[0m instance(s) listed in \x1b[32m$SSH_SERVER\x1b[0m to version \x1b[33m$AGENT_VERSION\x1b[0m"

COUNT=0
FAILED=0

for instance in "${instances[@]}"; do
  COUNT=$((COUNT + 1))

  if [[ -z "$instance" || "$instance" =~ ^[[:space:]]*# ]]; then
    echo -e "====>>>> Skipping empty or commented line ($COUNT/$TOTAL_LINES)"
    continue
  fi

  IFS=';' read -r server install_dir <<< "$instance"
  server="${server%$'\r'}"
  install_dir="${install_dir%$'\r'}"
  install_dir="${install_dir:-sensorsphere-${AGENT_NAME}}"

  remote_home="$(ssh -n "$server" 'printf "%s" "$HOME"')"
  rc=$?
  if [[ $rc -ne 0 || -z "$remote_home" ]]; then
    echo -e "====>>>> \x1b[31mFAILED\x1b[0m resolving remote home on \x1b[32m$server\x1b[0m ($COUNT/$TOTAL_LINES)"
    FAILED=1
    continue
  fi

  if [[ "$install_dir" == /* ]]; then
    remote_install_dir="$install_dir"
  else
    remote_install_dir="${remote_home}/${install_dir}"
  fi

  echo -e "====>>>> Updating \x1b[34m$AGENT_NAME\x1b[0m on \x1b[32m$server\x1b[0m"
  printf '====>>>> Remote home       : %s\n' "$remote_home"
  printf '====>>>> Install directory : %s\n' "$remote_install_dir"
  printf '====>>>> Target version    : %s\n' "$AGENT_VERSION"

  printf -v q_version '%q' "$AGENT_VERSION"
  printf -v q_install_dir '%q' "$remote_install_dir"
  printf -v q_agent_name '%q' "$AGENT_NAME"
  installer_url="https://raw.githubusercontent.com/sensorsphere/sensorsphere-${AGENT_NAME}/master/scripts/install.sh"
  printf -v q_installer_url '%q' "$installer_url"

  remote_command="set -o pipefail; curl -fsSL ${q_installer_url} | VERSION=${q_version} INSTALL_DIR=${q_install_dir} bash"
  if [[ -n "${AGENT_LOGS:-}" ]]; then
    remote_command+=" && cd ${q_install_dir} && docker compose --env-file .env logs -f"
  fi

  if ssh -n "$server" "$remote_command"; then
    echo -e "====>>>> \x1b[32mSUCCESS\x1b[0m updating \x1b[34m$AGENT_NAME\x1b[0m on \x1b[32m$server\x1b[0m to version \x1b[33m$AGENT_VERSION\x1b[0m ($COUNT/$TOTAL_LINES)"
  else
    rc=$?
    echo -e "====>>>> \x1b[31mFAILED\x1b[0m updating \x1b[34m$AGENT_NAME\x1b[0m on \x1b[32m$server\x1b[0m (exit $rc, $COUNT/$TOTAL_LINES)"
    FAILED=1
  fi
done

if [[ $FAILED -ne 0 ]]; then
  echo -e "====>>>> One or more \x1b[31m$AGENT_NAME\x1b[0m update(s) failed"
  exit 1
fi

echo -e "====>>>> All \x1b[34m$AGENT_NAME\x1b[0m update(s) completed successfully"
