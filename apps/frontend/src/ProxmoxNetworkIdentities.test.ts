import { describe, expect, it } from "vitest";
import { proxmoxNodeNetworkIdentities } from "./ProxmoxNetworkIdentities";

describe("proxmoxNodeNetworkIdentities", () => {
  it("keeps node IP identities but does not attach unrelated physical MAC addresses", () => {
    const identities = proxmoxNodeNetworkIdentities({
      ip: "7.0.100.11",
      networkInterfaces: [
        { name: "vmbr0", type: "bridge", ip: "7.0.100.11", cidr: "7.0.100.11/22", bridgePorts: ["eno1.100"], comment: "ADMIN" },
        { name: "vmbr5", type: "bridge", ip: "7.0.5.11", cidr: "7.0.5.11/24", bridgePorts: ["enx1.5"], comment: "CEPH" },
        { name: "enx6697f9c8eae7", type: "eth", mac: "66:97:F9:C8:EA:E7" },
        { name: "enxee37320b70ea", type: "eth", mac: "EE:37:32:0B:70:EA" }
      ]
    });

    expect(identities).toEqual([
      {
        identityType: "IP",
        value: "7.0.100.11",
        source: "discovery",
        labelCode: "MANAGEMENT",
        label: "Management",
        isPrimary: true,
        sortOrder: 0
      },
      {
        identityType: "IP",
        value: "7.0.5.11",
        source: "discovery",
        labelCode: "STORAGE",
        label: "Storage",
        isPrimary: false,
        sortOrder: 1
      }
    ]);
  });

  it("pairs a MAC only when the same interface reports both IP and MAC", () => {
    const identities = proxmoxNodeNetworkIdentities({
      ip: "10.0.0.10",
      networkInterfaces: [
        { name: "vmbr0", ip: "10.0.0.10", mac: "AA:BB:CC:DD:EE:FF", comment: "ADMIN" }
      ]
    });

    expect(identities.map(identity => [identity.identityType, identity.value, identity.labelCode, identity.isPrimary])).toEqual([
      ["IP", "10.0.0.10", "MANAGEMENT", true],
      ["MAC", "AA:BB:CC:DD:EE:FF", "MANAGEMENT", true]
    ]);
  });
});
