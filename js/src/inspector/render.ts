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

  // Render a group of ports (Inputs/Outputs/Ports), each with its wire target
  // and declared schema (type string with units, or a nested schema tree).
  function renderPorts(
    title: string,
    names: string[],
    ports: Record<string, string[]>,
    schemas: Record<string, unknown>,
  ): void {
    if (!names.length) return;
    panel.appendChild(label(title));
    for (const n of names) {
      panel.appendChild(port(n, (ports[n] ?? []).join("/"), schemas[n]));
    }
  }

  panel.appendChild(label(`Inspector · ${node.kind}`));
  panel.appendChild(h(node.name));
  if (node.kind === "process") {
    panel.appendChild(p(node.address ?? "(no address)", "mono"));
    panel.appendChild(p(`at: ${parentOf(selectedId)}`, "mono small"));
    // Class docstring — often the mathematical description of the process.
    if (node.doc) {
      panel.appendChild(label("Description"));
      panel.appendChild(pre(node.doc));
    }
    // Only show Config when it actually carries something — process configs are
    // often consumed at construction time and empty in the live state.
    if (node.config && typeof node.config === "object" && Object.keys(node.config).length) {
      panel.appendChild(label("Config"));
      panel.appendChild(pre(JSON.stringify(node.config, null, 2)));
    }
    const ports = node.ports ?? {};
    if (node.inputSchema || node.outputSchema) {
      // True directional ports from the process interface. A read-write port
      // legitimately appears in BOTH sections.
      const inS = node.inputSchema ?? {};
      const outS = node.outputSchema ?? {};
      renderPorts("Inputs", Object.keys(inS), ports, inS);
      renderPorts("Outputs", Object.keys(outS), ports, outS);
    } else {
      // Fallback for specs without interface schemas: group the merged ports.
      const dirs = node.portDirections ?? {};
      const schemas = node.portSchemas ?? {};
      const names = Object.keys(ports);
      renderPorts("Inputs", names.filter(n => dirs[n] === "in"), ports, schemas);
      renderPorts("Outputs", names.filter(n => dirs[n] === "out"), ports, schemas);
      renderPorts("Ports", names.filter(n => dirs[n] !== "in" && dirs[n] !== "out"), ports, schemas);
    }
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

/** One port block: name, its declared schema (type/units), and its wire path. */
function port(name: string, wire: string, schema: unknown): HTMLElement {
  const box = document.createElement("div");
  box.className = "bgv2-insp-port";
  const nm = document.createElement("div");
  nm.className = "bgv2-insp-portname";
  nm.textContent = name;
  box.appendChild(nm);
  if (typeof schema === "string") {
    box.appendChild(p(schema, "mono"));               // e.g. quantity[float,fg]
  } else if (schema && typeof schema === "object") {
    box.appendChild(pre(JSON.stringify(schema, null, 2)));  // nested type tree
  } else {
    box.appendChild(p("(no declared schema)", "muted small"));
  }
  if (wire) box.appendChild(p(`→ ${wire}`, "mono small"));
  return box;
}
