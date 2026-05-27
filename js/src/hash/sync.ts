import type { NodeId } from "../types";

export function encodeHash(vizId: string, collapsed: Set<NodeId>): string {
  if (collapsed.size === 0) return `#bgv2-${vizId}=collapse:`;
  const ids = Array.from(collapsed).sort().join(",");
  return `#bgv2-${vizId}=collapse:${ids}`;
}

export function decodeHash(hash: string, vizId: string): Set<NodeId> {
  const raw = hash.replace(/^#/, "");
  for (const part of raw.split("&")) {
    const m = part.match(new RegExp(`^bgv2-${escape(vizId)}=collapse:(.*)$`));
    if (m) {
      if (!m[1]) return new Set();
      return new Set(m[1].split(","));
    }
  }
  return new Set();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function writeHash(vizId: string, collapsed: Set<NodeId>): void {
  const slice = encodeHash(vizId, collapsed).replace(/^#/, "");
  const others = (window.location.hash.replace(/^#/, "").split("&") ?? [])
    .filter(p => p && !p.startsWith(`bgv2-${vizId}=`));
  const next = "#" + [...others, slice].filter(Boolean).join("&");
  history.replaceState(null, "", next);
}
