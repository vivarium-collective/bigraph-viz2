import type { LayoutResult, NodeId } from "../types";

export function renderInspector(
  panel: HTMLElement, lr: LayoutResult, selectedId: NodeId | null
): void {
  panel.innerHTML = "";
  if (!selectedId) {
    panel.appendChild(label("Inspector"));
    panel.appendChild(p("Nothing selected.", "muted"));
    return;
  }
  const ln = lr.byId.get(selectedId);
  if (!ln) return;
  const node = ln.node;
  panel.appendChild(label(`Inspector · ${node.kind}`));
  panel.appendChild(h(node.name));
  if (node.kind === "process") {
    panel.appendChild(p(node.address ?? "(no address)", "mono"));
    panel.appendChild(p(`at: ${parentOf(selectedId)}`, "mono small"));
    panel.appendChild(label("Config"));
    panel.appendChild(pre(JSON.stringify(node.config ?? {}, null, 2)));
    panel.appendChild(label("Ports → wires"));
    const tbl = document.createElement("table");
    tbl.className = "bgv2-portmap";
    for (const [pn, path] of Object.entries(node.ports ?? {})) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.textContent = pn;
      const td2 = document.createElement("td");
      td2.textContent = path.join("/");
      td2.className = "mono";
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbl.appendChild(tr);
    }
    panel.appendChild(tbl);
  } else if (node.kind === "variable") {
    panel.appendChild(p(node.type ?? "(no declared type)", "mono"));
    panel.appendChild(p(`at: ${parentOf(selectedId)}`, "mono small"));
    panel.appendChild(label("Value"));
    panel.appendChild(pre(JSON.stringify(node.value, null, 2)));
  } else {
    panel.appendChild(p(`at: ${parentOf(selectedId)}`, "mono small"));
    panel.appendChild(p(`${node.children.length} children`, "muted"));
  }
}

function label(t: string): HTMLElement { const e = document.createElement("div"); e.className = "bgv2-insp-label"; e.textContent = t; return e; }
function h(t: string): HTMLElement     { const e = document.createElement("div"); e.className = "bgv2-insp-name";  e.textContent = t; return e; }
function p(t: string, cls = ""): HTMLElement { const e = document.createElement("div"); e.className = `bgv2-insp-p ${cls}`; e.textContent = t; return e; }
function pre(t: string): HTMLElement   { const e = document.createElement("pre"); e.className = "bgv2-insp-pre"; e.textContent = t; return e; }
function parentOf(id: NodeId): string { const i = id.lastIndexOf("/"); return i < 0 ? "(root)" : id.slice(0, i); }
