SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

CONFIG_FILE=${1}
BOARD_ID=${2}
ESP_IP=${3}
KIND_NAME="${KIND_NAME:-generic-esp32}"
KIND_DESCRIPTION="${KIND_DESCRIPTION:-Generic ESP32}"
FLASH_SERVER=${FLASH_SERVER:-falcon@100.64.0.9}
LOGGER_LEVEL="${LOGGER_LEVEL:-INFO}"

echo "$SCRIPT_NAME started at $(date)"

# docker exec -it esphome-sensorsphere esphome clean /config/${CONFIG_FILE} \
#     && docker exec -it esphome-sensorsphere esphome compile /config/${CONFIG_FILE} \
#     && scp 

if [[ -n "${CLEAN}" ]] && [[ "${CLEAN}" == "1" ]]; then
    docker exec -it esphome-sensorsphere clean \
        -s BOARD_ID "${BOARD_ID}" \
        -s KIND_NAME "${KIND_NAME}" \
        -s KIND_DESCRIPTION "${KIND_DESCRIPTION}" \
        -s LOGGER_LEVEL "${LOGGER_LEVEL}" \
        compile /config/${CONFIG_FILE}
fi

docker exec -it esphome-sensorsphere esphome \
    -s BOARD_ID "${BOARD_ID}" \
    -s KIND_NAME "${KIND_NAME}" \
    -s KIND_DESCRIPTION "${KIND_DESCRIPTION}" \
    -s LOGGER_LEVEL "${LOGGER_LEVEL}" \
    compile /config/${CONFIG_FILE}

scp -p ${SCRIPT_DIR}/.esphome/build/${KIND_NAME}/build/firmware.ota.bin  $FLASH_SERVER:/tmp
scp -p ${SCRIPT_DIR}/.esphome/build/${KIND_NAME}/build/firmware.factory.bin  $FLASH_SERVER:/tmp
scp -p ${SCRIPT_DIR}/esp-ota-flash.sh $FLASH_SERVER:/tmp
ssh $FLASH_SERVER /tmp/esp-ota-flash.sh ${ESP_IP} /tmp/firmware.ota.bin

echo "$SCRIPT_NAME ended at $(date)"