#!/bin/bash

echo "-$@-"

# expected env. var. $AGENT_NAME
if [ -z "$AGENT_NAME" ]; then
  echo "Error: AGENT_NAME environment variable is not set. Please set it to the name of the agent (e.g., 'device-agent' or 'monitoring-agent')."
  exit 1
fi
# First mandatory argument is the SSH server
SSH_SERVER=${1}
# second mandatory argument is agent version to install
AGENT_VERSION=${2}

echo "SSH_SERVER or File: $SSH_SERVER"
echo "AGENT_NAME        : $AGENT_NAME"
echo "AGENT_VERSION     : $AGENT_VERSION"

if [[ -z "$SSH_SERVER" ]] || [[ -z "$AGENT_VERSION" ]]; then
  echo "Usage: $0 <ssh-server or @agents-file> <agent-version>"
  exit 1
fi

# check if the first argument is a file
if [ -f "$SSH_SERVER" ]; then
  # read all lines and push them to an array
  mapfile -t instances < "$SSH_SERVER"
else
  # if not a file, treat it as a single server
  instances=("$SSH_SERVER")
fi

# display the total number of instances to update
TOTAL_LINES=${#instances[@]}
echo -e "====>>>> Updating \x1b[34m${AGENT_NAME}\x1b[0m on \x1b[32m$TOTAL_LINES\x1b[0m instances listed in \x1b[32m$SSH_SERVER\x1b[0m to version \x1b[33m$AGENT_VERSION\x1b[0m"

# loop through the instances and update each one
COUNT=0
for instance in "${instances[@]}"; do
  # skip empty lines and comments
  if [[ -n "$instance" && ! "$instance" =~ ^# ]]; then
    # optional split by semicolon to allow for custom install directories
    IFS=';' read -r server install_dir <<< "$instance"
    install_dir="${install_dir:-sensorsphere-${AGENT_NAME}}"
    echo -e "====>>>> Updating \x1b[34m$AGENT_NAME\x1b[0m on \x1b[32m$server\x1b[0m to version \x1b[33m$AGENT_VERSION\x1b[0m in directory \x1b[33m$install_dir\x1b[0m"
    ssh -n "$server" "cd ${install_dir} && curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere-${AGENT_NAME}/master/scripts/install.sh | VERSION=${AGENT_VERSION} INSTALL_DIR=${install_dir} bash && if [ -n \"${AGENT_LOGS}\" ]; then docker compose logs -f; fi"
  else
    echo -e "====>>>> Skipping empty or commented line: \x1b[31m$server\x1b[0m"
  fi
  COUNT=$((COUNT + 1))
  echo -e "====>>>> Finished updating \x1b[34m$AGENT_NAME\x1b[0m on \x1b[32m$server\x1b[0m ($COUNT/$TOTAL_LINES)"
done

#   TOTAL_LINES=$(awk 'END { print NR }' "$SSH_SERVER")
#   echo -e "====>>>> Updating ${AGENT_NAME} on \x1b[32m$TOTAL_LINES\x1b[0m servers listed in \x1b[32m$SSH_SERVER\x1b[0m to version \x1b[33m$AGENT_VERSION\x1b[0m"
#   COUNT=0
#   while IFS= read -r line || [[ -n "$line" ]]; do
#      if [[ -n "$line" && ! "$line" =~ ^# ]]; then
#         # display $line wih blue color
#       echo -e "====>>>> Updating \x1b[34m$AGENT_NAME\x1b[0m on \x1b[32m$line\x1b[0m to version \x1b[33m$AGENT_VERSION\x1b[0m"
#       # ssh -n ${line} "cd ${INSTALL_DIRECTORY} && curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere-${AGENT_NAME}/master/scripts/install.sh | VERSION=${AGENT_VERSION} bash && if [ -n \"${AGENT_LOGS}\" ]; then docker compose logs -f; fi"
#      else
#       echo -e "====>>>> Skipping empty or commented line: \x1b[31m$line\x1b[0m"
#      fi
#     COUNT=$((COUNT + 1))
#     echo -e "====>>>> Finished updating $AGENT_NAME on \x1b[32m$line\x1b[0m ($COUNT/$TOTAL_LINES)"
#   done < "$SSH_SERVER"
#   echo -e "====>>>> Finished updating $AGENT_NAME on all servers in \x1b[32m$SSH_SERVER\x1b[0m"
#   exit 0
# fi

# INSTALL_DIRECTORY=${INSTALL_DIRECTORY:-sensorsphere-${AGENT_NAME}}

# ssh ${SSH_SERVER} "cd ${INSTALL_DIRECTORY} && curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere-${AGENT_NAME}/master/scripts/install.sh | VERSION=${AGENT_VERSION} bash && if [ -n \"${AGENT_LOGS}\" ]; then docker compose logs -f; fi"
