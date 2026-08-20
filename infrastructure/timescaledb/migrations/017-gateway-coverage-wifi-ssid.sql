-- WiFi SSID diagnostic metadata for BLE gateways shown in Gateway Coverage.

ALTER TABLE gateway_coverage_gateways
  ADD COLUMN IF NOT EXISTS wifi_ssid text;
