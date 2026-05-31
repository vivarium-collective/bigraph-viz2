import { describe, it, expect, beforeEach } from "vitest";
import { renderPanel, collectProcesses, buildNodeTree } from "../src/panel/render";
import type { PanelState, PanelCallbacks } from "../src/panel/render";
import { layout } from "../src/layout";
import { normalize } from "../src/normalize";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

function names(panel: HTMLElement): string[] {
  return Array.from(panel.querySelectorAll(".bgv2-proc-row-name")).map(e => e.textContent || "");
}
const noop: PanelCallbacks = {
  onTab: () => {}, onToggleHidden: () => {}, onShowAll: () => {},
  onSelectNode: () => {}, onToggleExpand: () => {},
};

describe("processes panel", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("collectProcesses finds every process in the spec", () => {
    const root = normalize(cellSpec);
    const procs = collectProcesses(root).map(p => p.id).sort();
    expect(procs).toContain("cell/diffusion");
    expect(procs).toContain("cell/cytoplasm/metabolism");
  });

  it("renders three tabs and a switch + name per process; wires callbacks", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    const processes = collectProcesses(root);

    let toggled: [string, boolean] | null = null;
    let selected: string | null = null;
    const state: PanelState = {
      activeTab: "processes", selectedId: null, hidden: new Set(),
      processes, nodeTree: buildNodeTree(root), expanded: new Set(),
    };
    renderPanel(panel, lr, state, {
      ...noop,
      onToggleHidden: (id, hide) => { toggled = [id, hide]; },
      onSelectNode: (id) => { selected = id; },
    });

    expect(panel.querySelectorAll(".bgv2-tab").length).toBe(3);
    const rows = panel.querySelectorAll(".bgv2-proc-row");
    expect(rows.length).toBe(processes.length);

    const input = rows[0].querySelector("input[type=checkbox]") as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    expect(toggled![1]).toBe(true);

    (rows[0].querySelector(".bgv2-proc-info") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }));
    expect(selected).toBe(processes[0].id);
  });

  it('"Show all hidden" appears and fires when something is hidden', () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const panel = document.createElement("div");
    const processes = collectProcesses(root);
    let shownAll = false;
    const state: PanelState = {
      activeTab: "processes", selectedId: null, hidden: new Set([processes[0].id]),
      processes, nodeTree: buildNodeTree(root), expanded: new Set(),
    };
    renderPanel(panel, lr, state, { ...noop, onShowAll: () => { shownAll = true; } });
    const showAll = panel.querySelector(".bgv2-showall") as HTMLButtonElement;
    expect(showAll).not.toBeNull();
    showAll.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(shownAll).toBe(true);
  });
});

describe("Nodes tab (tree)", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("buildNodeTree nests non-process nodes; processes are excluded", () => {
    const tree = buildNodeTree(normalize(cellSpec));
    expect(tree.children.map(c => c.id).sort()).toEqual(["cell/cytoplasm", "cell/membrane"]);
    const cyto = tree.children.find(c => c.id === "cell/cytoplasm")!;
    expect(cyto.children.map(c => c.id)).toContain("cell/cytoplasm/M");
    expect(cyto.children.map(c => c.id)).not.toContain("cell/cytoplasm/metabolism");
  });

  it("shows top-level first, reveals children only when expanded", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const panel = document.createElement("div");
    const tree = buildNodeTree(root);

    const base: PanelState = {
      activeTab: "nodes", selectedId: null, hidden: new Set(),
      processes: [], nodeTree: tree, expanded: new Set(),
    };
    renderPanel(panel, lr, base, noop);
    expect(names(panel)).toContain("cytoplasm");
    expect(names(panel)).not.toContain("M");           // collapsed

    renderPanel(panel, lr, { ...base, expanded: new Set(["cell/cytoplasm"]) }, noop);
    expect(names(panel)).toContain("M");                // expanded reveals child

    // Clicking a caret toggles expansion.
    let expandedId: string | null = null;
    renderPanel(panel, lr, base, { ...noop, onToggleExpand: (id) => { expandedId = id; } });
    (panel.querySelector(".bgv2-tree-caret") as HTMLElement)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(expandedId).not.toBeNull();
  });

  it("a node whose ancestor is hidden reads as off + disabled", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const panel = document.createElement("div");
    const state: PanelState = {
      activeTab: "nodes", selectedId: null, hidden: new Set(["cell/cytoplasm"]),
      processes: [], nodeTree: buildNodeTree(root), expanded: new Set(["cell/cytoplasm"]),
    };
    renderPanel(panel, lr, state, noop);
    const rows = Array.from(panel.querySelectorAll(".bgv2-proc-row"));
    const childRow = rows.find(r => r.querySelector(".bgv2-proc-row-name")?.textContent === "M")!;
    const input = childRow.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
  });
});
