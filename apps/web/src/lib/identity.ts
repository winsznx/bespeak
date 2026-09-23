import iconManifest from "@bespeak/assets/icons";

interface IconEntry {
  sourceUrl: string;
  sourceKind: string;
  note?: string;
  retrievedAt: string;
  checksum: string;
  bytes: number;
  localPath: string;
}

const ICONS = (iconManifest as {icons: Record<string, IconEntry>}).icons;

/// Resolve the locally served icon for a shipped asset, token or network.
///
/// Returns null only when something genuinely is not in the manifest. The sync script
/// fails the build rather than shipping a gap, so a null here in production means a real
/// regression worth surfacing, not an expected fallback.
export function iconFor(key: string): string | null {
  return ICONS[key]?.localPath ?? null;
}

export function iconProvenance(key: string): IconEntry | null {
  return ICONS[key] ?? null;
}

/// Marks whose artwork is a dark plate need a hairline ring to separate from a dark
/// surface; the issuer's equity tiles carry their own colour and do not.
export const DARK_PLATE_KEYS = new Set(["okb", "x-layer"]);
