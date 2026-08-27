SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

CONFIG_FILE=${1}
BOARD_ID=${2}
ESP_IP=${3}
KIND_NAME="${4}"
KIND_DESCRIPTION="${5}"
FLASH_SERVER=${FLASH_SERVER:-falcon@100.64.0.9}
LOGGER_LEVEL="${LOGGER_LEVEL:-INFO}"

BUILD_DATE="$(date +"%Y%m%d-%H%M%S")"

echo "$SCRIPT_NAME started at $(date)"
echo "======================================"
echo "   FLASH_ONLY      : ${FLASH_ONLY}"
echo "   BOARD_ID        : $BOARD_ID"
echo "   KIND_NAME       : $KIND_NAME"
echo "   KIND_DESCRIPTION: $KIND_DESCRIPTION"
echo "   FLASH_SERVER    : $FLASH_SERVER"
echo "   LOGGER_LEVEL    : $LOGGER_LEVEL"
echo "   ESP_IP          : ${ESP_IP}"
echo "   BUILD_DATE      : ${BUILD_DATE}"
echo "   ESP_EXTRA_VARS  : ${ESP_EXTRA_VARS}"
echo "======================================"

if [[ ! -n "$FLASH_ONLY" ]] || [[ "$FLASH_ONLY" -ne "1" ]]; then
    if [[ -n "${CLEAN}" ]] && [[ "${CLEAN}" == "1" ]]; then
        docker exec -it esphome-sensorsphere clean \
            -s BOARD_ID "${BOARD_ID}" \
            -s KIND_NAME "${KIND_NAME}" \
            -s KIND_DESCRIPTION "${KIND_DESCRIPTION}" \
            -s LOGGER_LEVEL "${LOGGER_LEVEL}" \
            compile /config/${CONFIG_FILE}
    fi
    docker exec -it esphome-sensorsphere esphome \
        -s BUILD_DATE "${BUILD_DATE}" \
        -s BOARD_ID "${BOARD_ID}" \
        -s KIND_NAME "${KIND_NAME}" \
        -s KIND_DESCRIPTION "${KIND_DESCRIPTION}" \
        -s LOGGER_LEVEL "${LOGGER_LEVEL}" \
        ${ESP_EXTRA_VARS} \
        compile /config/${CONFIG_FILE}

    if [[ $? -ne 0 ]]; then
        echo "!!!Error!!! during compilation"
        exit 1
    fi
fi

if [ -n "${ESP_IP}" ]; then
    echo "Flashing OTA to ${ESP_IP}..."
    
    scp -p ${SCRIPT_DIR}/.esphome/build/${KIND_NAME}/build/firmware.ota.bin $FLASH_SERVER:/tmp \
        && scp -p ${SCRIPT_DIR}/.esphome/build/${KIND_NAME}/build/firmware.factory.bin $FLASH_SERVER:/tmp \
        && scp -p ${SCRIPT_DIR}/esp-ota-flash.sh $FLASH_SERVER:/tmp \
        && ssh $FLASH_SERVER /tmp/esp-ota-flash.sh ${ESP_IP} /tmp/firmware.ota.bin
fi

echo "$SCRIPT_NAME ended at $(date)"