#!/bin/bash

IMAGE_NAME="sensorsphere-rdc"

BUILD_ARGS=""
BUILD_ARGS="${BUILD_ARGS} --build-arg UID=$(id -u)"
BUILD_ARGS="${BUILD_ARGS} --build-arg GID=$(id -g)"

docker build ${BUILD_ARGS} -t ${IMAGE_NAME} .

SSH_AGENT_ARGS=()
SSH_AUTH_SOCK_SOURCE="${SSH_AUTH_SOCK:-$HOME/.ssh/ssh_auth_sock}"

if [ -S "${SSH_AUTH_SOCK_SOURCE}" ]; then
  SSH_AUTH_SOCK_REAL="$(readlink -f "${SSH_AUTH_SOCK_SOURCE}")"

  echo "Forwarding SSH agent: ${SSH_AUTH_SOCK_REAL}"

  SSH_AGENT_ARGS=(
    -e SSH_AUTH_SOCK=/tmp/ssh-agent.sock
    -v "${SSH_AUTH_SOCK_REAL}:/tmp/ssh-agent.sock"
  )
else
  echo "WARNING: SSH_AUTH_SOCK is not available; Git SSH authentication will not work."
fi

docker run --rm -it \
  --name remote-desktop-commander \
  --hostname "$(hostname)" \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  -e HOME=/home/ubuntu \
  "${SSH_AGENT_ARGS[@]}" \
  -v "$HOME:/home/ubuntu" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /home/ubuntu \
  ${IMAGE_NAME}