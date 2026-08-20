# ESPHome BLE Gateways

Projet factorisé pour plusieurs passerelles BLE ESPHome.

## Arborescence

```text
esphome-ble-gateways-full/
├── ble-gateway-esp32-c6.yaml
├── ble-gateway-esp32-cam.yaml
├── secrets.example.yaml
├── README.md
└── packages/
    ├── base.yaml
    ├── network.yaml
    ├── mqtt.yaml
    ├── diagnostics.yaml
    ├── hardware/
    │   ├── esp32-c6-devkitm-1.yaml
    │   └── esp32-cam.yaml
    └── ble/
        ├── tracker.yaml
        └── atc-sensors.yaml
```

Les deux fichiers `ble-gateway-*.yaml` sont volontairement à la racine afin qu'ils
soient visibles directement dans ESPHome Dashboard.

Les fichiers du répertoire `packages/` contiennent les éléments partagés.

## 1. Installation

Copier le contenu du dossier dans le répertoire de configuration ESPHome.

Créer ensuite `secrets.yaml` à partir de :

```text
secrets.example.yaml
```

Exemple :

```yaml
wifi_homefcsiot_ssid: "MonWifi"
wifi_homefcsiot_password: "MonMotDePasse"
wifi_ap_password: "MotDePasseFallback"
```

## 2. Validation

ESP32-C6 :

```bash
esphome config ble-gateway-esp32-c6.yaml
```

ESP32-CAM :

```bash
esphome config ble-gateway-esp32-cam.yaml
```

## 3. Compilation

```bash
esphome compile ble-gateway-esp32-c6.yaml
esphome compile ble-gateway-esp32-cam.yaml
```

## 4. Premier flash

ESP32-C6 :

```bash
esphome run ble-gateway-esp32-c6.yaml
```

ESP32-CAM :

```bash
esphome run ble-gateway-esp32-cam.yaml
```

## 5. Nom unique par MAC

Le package `base.yaml` contient :

```yaml
esphome:
  name: "${device_name}"
  friendly_name: "${friendly_name}"
  name_add_mac_suffix: true
```

ESPHome ajoute les trois derniers octets de la MAC au nom du noeud.

Par exemple :

```text
ble-gateway-esp32-c6-a1b2c3
```

## 6. MQTT

Le broker configuré est :

```text
7.0.90.22:1883
```

Les messages birth/will sont publiés dans :

```text
<device_name>/status
```

La publication normale des entités MQTT reste gérée par ESPHome.

## 7. Diagnostics réseau

Le package `diagnostics.yaml` expose :

- adresse IP
- adresse MAC
- SSID
- BSSID
- serveur DNS
- version ESPHome
- RSSI Wi-Fi
- qualité Wi-Fi en %
- uptime

Ces valeurs sont disponibles dans le Web Server et via MQTT.

## 8. Capteurs BLE ATC

Les deux capteurs configurés sont :

```text
A4:C1:38:C8:AC:73
A4:C1:38:D0:CA:52
```

Ils publient :

- température
- humidité
- niveau de batterie
- tension batterie
- RSSI BLE

Pour ajouter un troisième capteur, modifier uniquement :

```text
packages/ble/atc-sensors.yaml
```

## 9. Ajouter un nouveau type d'ESP32

Créer un fichier dans :

```text
packages/hardware/
```

Par exemple :

```text
esp32-c3-supermini.yaml
```

Puis ajouter un nouveau YAML device à la racine utilisant les mêmes packages communs.


## 10. Build + Upload OTA remotely

### Generic ESP32
```sh
ESP_IP=10.0.10.11
#ESP_IP=10.0.10.12
BOARD_ID=esp32-cam-ai-thinker

./esp-build.sh generic-esp32.yaml ${BOARD_ID} ${ESP_IP}

```

```sh
ESP_IP=
BOARD_ID=esp32-mhetesp32minikit
./esp-build.sh generic-esp32.yaml ${BOARD_ID} ${ESP_IP}

```

### BLE Gateway

```sh
#ESP_IP=10.0.10.121
GATEWAY_INDEX=01
MQTT_BROKER=7.0.90.22
MQTT_PORT=1883
BOARD_ID=esp32-mhetesp32minikit

export ESP_EXTRA_VARS="-s GATEWAY_INDEX ${GATEWAY_INDEX} -s MQTT_BROKER ${MQTT_BROKER} -s MQTT_PORT ${MQTT_PORT}"

./esp-build.sh ble-gateway-esp32.yaml ${BOARD_ID} ${ESP_IP}

```