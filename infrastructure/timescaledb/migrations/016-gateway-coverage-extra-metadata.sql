-- Additional diagnostic metadata for BLE gateways shown in Gateway Coverage.

ALTER TABLE gateway_coverage_gateways
  ADD COLUMN IF NOT EXISTS build_date text;

ALTER TABLE gateway_coverage_gateways
  ADD COLUMN IF NOT EXISTS ip_address text;
