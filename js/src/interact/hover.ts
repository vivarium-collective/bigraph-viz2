import type { LayoutResult } from "../types";

export function attachHover(svg: SVGSVGElement, lr: LayoutResult): () => void {
  const tooltip = document.createElement("div");
  tooltip.className = "bgv2-tooltip";
  tooltip.style.cssText = "position:fixed;pointer-events:none;background:#0f172a;color:#fff;padding:4px 8px;border-radius:3px;font:11px/1.3 ui-monospace,monospace;display:none;z-index:9999;";
  document.body.appendChild(tooltip);

  function onMove(e: MouseEvent) {
    const target = (e.target as Element).closest(".bgv2-node");
    if (!target) { tooltip.style.display = "none"; return; }
    const id = target.getAttribute("data-bgv2-id");
    if (!id) return;
    const ln = lr.byId.get(id);
    if (!ln) return;
    const line1 = ln.node.name;
    const line2 = ln.node.kind === "process" ? (ln.node.address ?? "")
                : ln.node.kind === "variable" ? (ln.node.type ?? "variable")
                : `store · ${ln.node.children.length} children`;
    tooltip.innerHTML = `<div>${esc(line1)}</div><div style="opacity:.7">${esc(line2)}</div>`;
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top  = `${e.clientY + 12}px`;
    tooltip.style.display = "block";
  }
  function onLeave() { tooltip.style.display = "none"; }
  svg.addEventListener("mousemove", onMove);
  svg.addEventListener("mouseleave", onLeave);

  return () => {
    svg.removeEventListener("mousemove", onMove);
    svg.removeEventListener("mouseleave", onLeave);
    tooltip.remove();
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!));
}
