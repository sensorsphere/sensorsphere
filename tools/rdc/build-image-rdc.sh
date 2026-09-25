#!/bin/bash

IMAGE_NAME="sensorsphere-rdc"

BUILD_ARGS=""
BUILD_ARGS="${BUILD_ARGS} --build-arg UID=$(id -u)"
BUILD_ARGS="${BUILD_ARGS} --build-arg GID=$(id -g)"

docker build ${BUILD_ARGS} -t ${IMAGE_NAME} .

#docker run -it --rm ${IMAGE_NAME} sh -c "id;whoami"

docker run --rm -it \
  --name remote-desktop-commander \
  --hostname "$(hostname)" \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  -e HOME=/home/ubuntu \
  -v "$HOME:/home/ubuntu" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /home/ubuntu \
  ${IMAGE_NAME}