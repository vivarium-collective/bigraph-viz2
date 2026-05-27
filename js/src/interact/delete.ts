import type { NodeId } from "../types";

/**
 * Keyboard-driven delete + undo of the currently selected node.
 *
 *   Delete | Backspace → hide the selected node (and any wires touching it)
 *   Cmd/Ctrl + Z       → restore the most-recently-deleted node
 *
 * State is owned by the caller (mount.ts); we just call `onChange` with the
 * next deleted set when the user invokes one of the keys. Reload restores
 * everything because the deleted state is in-memory only.
 */
export function attachDelete(
  svg: SVGSVGElement,
  getSelectedId: () => NodeId | null,
  currentDeleted: Set<NodeId>,
  onChange: (next: Set<NodeId>) => void,
): () => void {
  // History stack lives in this closure so undo is per-mount.
  const undoStack: NodeId[] = [];

  function onKey(e: KeyboardEvent) {
    // Don't hijack typing in form inputs (none in our DOM today, but
    // future-proof).
    const t = e.target as Element | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as HTMLElement).isContentEditable)) {
      return;
    }
    // Only react when the user's mouse is over our SVG, or when a node is
    // selected — otherwise pressing Backspace anywhere in the page would
    // trigger a delete. The simplest gate is "must have a selected node".
    if (e.key === "Delete" || e.key === "Backspace") {
      const sel = getSelectedId();
      if (!sel) return;
      // Don't delete the root — there'd be nothing left to render.
      if (!sel.includes("/")) return;
      e.preventDefault();
      const next = new Set(currentDeleted);
      next.add(sel);
      undoStack.push(sel);
      currentDeleted = next;
      onChange(next);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      if (undoStack.length === 0) return;
      e.preventDefault();
      const id = undoStack.pop()!;
      const next = new Set(currentDeleted);
      next.delete(id);
      currentDeleted = next;
      onChange(next);
    }
  }

  window.addEventListener("keydown", onKey);
  // `svg` is captured for symmetry with other interaction modules and so
  // future variants can scope to per-svg focus; it's intentionally unused
  // beyond ensuring the closure ties to this instance.
  void svg;
  return () => window.removeEventListener("keydown", onKey);
}
