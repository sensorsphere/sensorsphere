export interface DiscoveryEntityInventoryItem {
  name: string;
  type: string;
  key: string;
}

export interface DiscoveryEntityInventory {
  items: DiscoveryEntityInventoryItem[];
  signature: string | null;
  count: number | null;
}

function normalizedPart(value: string): string {
  return value.trim().toLowerCase();
}

export function discoveryEntityInventory(device: Record<string, unknown>): DiscoveryEntityInventory {
  const raw = device.entities;
  if (!Array.isArray(raw)) return { items: [], signature: null, count: null };

  const byKey = new Map<string, DiscoveryEntityInventoryItem>();
  raw.forEach((entity, index) => {
    let type = "unknown";
    let name = "";
    if (typeof entity === "string") {
      const value = entity.trim();
      const separator = value.indexOf(":");
      if (separator > 0 && separator < value.length - 1) {
        type = value.slice(0, separator).trim() || "unknown";
        name = value.slice(separator + 1).trim() || value;
      } else {
        name = value || `entity ${index + 1}`;
      }
    } else if (entity && typeof entity === "object") {
      const item = entity as Record<string, unknown>;
      const rawType = [item.type, item.entityType, item.domain, item.platform, item.kind]
        .find(value => typeof value === "string" && value.trim()) as string | undefined;
      const rawName = [item.name, item.entityId, item.id, item.objectId, item.key]
        .find(value => typeof value === "string" && value.trim()) as string | undefined;
      type = rawType?.trim() || "unknown";
      name = rawName?.trim() || `entity ${index + 1}`;
    } else {
      name = String(entity ?? `entity ${index + 1}`);
    }
    const key = `${normalizedPart(type)}:${normalizedPart(name)}`;
    if (!byKey.has(key)) byKey.set(key, { type, name, key });
  });

  const items = [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  return {
    items,
    signature: items.map(item => item.key).join("\n"),
    count: items.length
  };
}
