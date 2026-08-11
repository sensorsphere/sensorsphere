## Start ESPHome

```sh

PROJECT_DIR="$HOME/sensorsphere"
CONTAINER_NAME="esphome-sensorsphere"

alias esphome="docker exec -it $CONTAINER_NAME esphome"

# Start container
docker run -d \
  --name ${CONTAINER_NAME} \
  --restart=unless-stopped \
  -p 16052:6052 \
  -v ${PROJECT_DIR}/esphome:/config \
  ghcr.io/esphome/esphome:latest

alias 

```

## Stop ESPHome

```sh
docker rm -f ${CONTAINER_NAME}

```