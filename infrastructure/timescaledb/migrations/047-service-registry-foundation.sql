-- ============================================================================
-- SensorSphere
-- Migration 047 - Service Registry foundation
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_classes (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NULL,
    icon TEXT NOT NULL DEFAULT 'cloud',
    color TEXT NOT NULL DEFAULT 'blue',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO service_classes (code, label, description, icon, color, sort_order) VALUES
    ('CLOUD', 'Cloud', 'Cloud infrastructure and platform providers', 'cloud', 'blue', 10),
    ('HOSTING', 'Hosting', 'VPS, dedicated server and managed hosting providers', 'server-stack', 'violet', 20),
    ('NETWORK', 'Network', 'Internet access, connectivity and network services', 'network', 'cyan', 30),
    ('DNS', 'DNS & Domains', 'DNS, registrar and domain services', 'globe', 'teal', 40),
    ('SAAS', 'SaaS', 'Hosted software and online platforms', 'cloud-network', 'indigo', 50),
    ('SECURITY', 'Security', 'Security, VPN, identity and protection services', 'shield', 'red', 60),
    ('COMMUNICATION', 'Communication', 'Mail, messaging and communication services', 'mail', 'orange', 70),
    ('OTHER', 'Other', 'Unclassified external or hosted services', 'link', 'gray', 999)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS service_types (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    service_class TEXT NOT NULL REFERENCES service_classes(code),
    description TEXT NULL,
    icon TEXT NOT NULL DEFAULT 'cloud',
    color TEXT NOT NULL DEFAULT 'blue',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO service_types (code, label, service_class, description, icon, color, sort_order) VALUES
    ('cloud_provider', 'Cloud provider', 'CLOUD', 'General-purpose cloud provider', 'cloud', 'blue', 10),
    ('vps_provider', 'VPS provider', 'HOSTING', 'Virtual private server provider', 'server-stack', 'violet', 20),
    ('dedicated_hosting', 'Dedicated hosting', 'HOSTING', 'Dedicated server hosting provider', 'server', 'violet', 30),
    ('isp', 'ISP', 'NETWORK', 'Internet service provider', 'network', 'cyan', 40),
    ('dns_provider', 'DNS provider', 'DNS', 'Authoritative or managed DNS provider', 'globe', 'teal', 50),
    ('registrar', 'Domain registrar', 'DNS', 'Domain name registrar', 'globe-lock', 'teal', 60),
    ('cdn', 'CDN', 'NETWORK', 'Content delivery network', 'cloud-network', 'cyan', 70),
    ('vpn', 'VPN service', 'SECURITY', 'VPN or private networking service', 'shield', 'red', 80),
    ('identity_provider', 'Identity provider', 'SECURITY', 'Identity and authentication provider', 'key', 'red', 90),
    ('monitoring', 'Monitoring', 'SAAS', 'Hosted monitoring or observability service', 'activity', 'indigo', 100),
    ('source_control', 'Source control', 'SAAS', 'Hosted source code management service', 'code', 'indigo', 110),
    ('smtp', 'SMTP / Mail', 'COMMUNICATION', 'Hosted email or SMTP provider', 'mail', 'orange', 120),
    ('messaging', 'Messaging', 'COMMUNICATION', 'Hosted messaging or notification service', 'message', 'orange', 130),
    ('saas', 'SaaS application', 'SAAS', 'General hosted software service', 'cloud', 'indigo', 140),
    ('other', 'Other', 'OTHER', 'Other service type', 'link', 'gray', 999)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    service_class = EXCLUDED.service_class,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS service_registry_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    service_class TEXT NOT NULL REFERENCES service_classes(code),
    service_type TEXT NOT NULL REFERENCES service_types(code),
    provider TEXT NULL,
    description TEXT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    health_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    last_checked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_service_registry_health CHECK (health_status IN ('ONLINE','WARNING','OFFLINE','UNKNOWN','DISABLED'))
);

CREATE INDEX IF NOT EXISTS idx_service_registry_services_class_type
    ON service_registry_services(service_class, service_type, name);

CREATE TABLE IF NOT EXISTS service_registry_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES service_registry_services(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_identifier TEXT NULL,
    contract_identifier TEXT NULL,
    description TEXT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_registry_accounts_service
    ON service_registry_accounts(service_id, sort_order, name);

CREATE TABLE IF NOT EXISTS service_registry_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES service_registry_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT 'custom',
    external_id TEXT NULL,
    description TEXT NULL,
    linked_device_id UUID NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_registry_resources_account
    ON service_registry_resources(account_id, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_service_registry_resources_device
    ON service_registry_resources(linked_device_id) WHERE linked_device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS service_registry_access_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES service_registry_services(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    link_type TEXT NOT NULL DEFAULT 'WEB',
    url_template TEXT NOT NULL,
    username TEXT NULL,
    port INTEGER NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    icon TEXT NOT NULL DEFAULT 'globe',
    color TEXT NOT NULL DEFAULT 'blue',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_service_registry_access_port CHECK (port IS NULL OR port BETWEEN 1 AND 65535)
);

CREATE INDEX IF NOT EXISTS idx_service_registry_access_service
    ON service_registry_access_links(service_id, sort_order, name);
