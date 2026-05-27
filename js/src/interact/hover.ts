import type { LayoutResult } from "../types";

export function attachHover(svg: SVGSVGElement, lr: LayoutResult): () => void {
  const tooltip = document.createElement("div");
  tooltip.className = "bgv2-tooltip";
  tooltip.style.cssText = "position:fixed;pointer-events:none;background:#0f172a;color:#fff;padding:4px 8px;border-radius:3px;font:11px/1.3 ui-monospace,monospace;display:none;z-index:9999;";
  document.body.appendChild(tooltip);

  let emphasizedId: string | null = null;

  function emphasizeFor(id: string | null): void {
    if (id === emphasizedId) return;
    if (emphasizedId !== null) {
      svg.querySelectorAll(".bgv2-wire-emph").forEach(el => el.classList.remove("bgv2-wire-emph"));
      svg.querySelectorAll(".bgv2-port-emph").forEach(el => el.classList.remove("bgv2-port-emph"));
      svg.querySelectorAll(".bgv2-port-label-emph").forEach(el => el.classList.remove("bgv2-port-label-emph"));
    }
    emphasizedId = id;
    if (id === null) return;
    const idEsc = cssEsc(id);
    svg.querySelectorAll(
      `path.bgv2-wire[data-bgv2-from="${idEsc}"], path.bgv2-wire[data-bgv2-to="${idEsc}"]`,
    ).forEach(w => w.classList.add("bgv2-wire-emph"));
    svg.querySelectorAll(
      `.bgv2-port[data-bgv2-from="${idEsc}"], .bgv2-port[data-bgv2-to="${idEsc}"]`,
    ).forEach(p => p.classList.add("bgv2-port-emph"));
    svg.querySelectorAll(
      `.bgv2-port-label[data-bgv2-from="${idEsc}"], .bgv2-port-label[data-bgv2-to="${idEsc}"]`,
    ).forEach(l => l.classList.add("bgv2-port-label-emph"));
  }

  function onMove(e: MouseEvent) {
    const target = (e.target as Element).closest(".bgv2-node");
    if (!target) {
      tooltip.style.display = "none";
      emphasizeFor(null);
      return;
    }
    const id = target.getAttribute("data-bgv2-id");
    if (!id) return;
    const ln = lr.byId.get(id);
    if (!ln) return;
    emphasizeFor(id);
    const line1 = ln.node.name;
    const line2 = ln.node.kind === "process" ? (ln.node.address ?? "")
                : ln.node.kind === "variable" ? (ln.node.type ?? "variable")
                : `store · ${ln.node.children.length} children`;
    tooltip.innerHTML = `<div>${esc(line1)}</div><div style="opacity:.7">${esc(line2)}</div>`;
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top  = `${e.clientY + 12}px`;
    tooltip.style.display = "block";
  }
  function onLeave() {
    tooltip.style.display = "none";
    emphasizeFor(null);
  }
  svg.addEventListener("mousemove", onMove);
  svg.addEventListener("mouseleave", onLeave);

  return () => {
    svg.removeEventListener("mousemove", onMove);
    svg.removeEventListener("mouseleave", onLeave);
    tooltip.remove();
    emphasizeFor(null);
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!));
}

function cssEsc(s: string): string {
  // Minimal CSS-attribute-selector escape: backslash-escape any quote /
  // backslash. Node ids in process-bigraph are alphanumeric + `/` so this is
  // overkill in practice, but cheap.
  return s.replace(/(["\\])/g, "\\$1");
}
