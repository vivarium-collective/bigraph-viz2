import type { BBox } from "../types";

/**
 * Obstacle-avoiding orthogonal router.
 *
 * `buildRouter` precomputes a coarse grid of candidate routing lines from the
 * edges of all obstacle boxes (a "Hanan" grid). `route(start, goal)` augments
 * that grid with the two endpoint coordinates and runs A* over axis-aligned
 * moves, producing a polyline that threads AROUND obstacles rather than through
 * them. A turn penalty biases the search toward long straight runs, so bundles
 * of wires share corridors and read as channels.
 *
 * Obstacles are the solid glyphs (processes, variables, collapsed chips) — open
 * store containers are NOT obstacles, since wires legitimately enter them to
 * reach nested targets.
 */

const CLEARANCE = 7;        // inflate obstacles so wires don't graze glyph edges
const TURN_PENALTY = 22;    // cost per corner; favors straight channels
const MAX_EXPANSIONS = 24000;

export interface Router {
  route(
    start: { x: number; y: number },
    goal: { x: number; y: number },
  ): Array<{ x: number; y: number }> | null;
}

interface InflRect { x0: number; y0: number; x1: number; y1: number; }

function uniqSorted(vals: number[]): number[] {
  return Array.from(new Set(vals.map(v => Math.round(v * 2) / 2))).sort((a, b) => a - b);
}

export function buildRouter(obstacles: BBox[], bounds: BBox): Router {
  const rects: InflRect[] = obstacles.map(b => ({
    x0: b.x - CLEARANCE, y0: b.y - CLEARANCE,
    x1: b.x + b.w + CLEARANCE, y1: b.y + b.h + CLEARANCE,
  }));
  const baseXs: number[] = [bounds.x, bounds.x + bounds.w];
  const baseYs: number[] = [bounds.y, bounds.y + bounds.h];
  for (const r of rects) { baseXs.push(r.x0, r.x1); baseYs.push(r.y0, r.y1); }

  // True when a horizontal segment at y spanning [x1,x2] passes through the
  // strict interior of any obstacle (running along an edge is allowed).
  function hBlocked(x1: number, x2: number, y: number): boolean {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    for (const r of rects) {
      if (y > r.y0 && y < r.y1 && lo < r.x1 - 0.01 && hi > r.x0 + 0.01) return true;
    }
    return false;
  }
  function vBlocked(y1: number, y2: number, x: number): boolean {
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    for (const r of rects) {
      if (x > r.x0 && x < r.x1 && lo < r.y1 - 0.01 && hi > r.y0 + 0.01) return true;
    }
    return false;
  }

  function route(start: { x: number; y: number }, goal: { x: number; y: number }) {
    const xs = uniqSorted([...baseXs, start.x, goal.x]);
    const ys = uniqSorted([...baseYs, start.y, goal.y]);
    const nx = xs.length, ny = ys.length;
    if (nx < 2 || ny < 2) return null;
    const si = xs.indexOf(Math.round(start.x * 2) / 2), sj = ys.indexOf(Math.round(start.y * 2) / 2);
    const gi = xs.indexOf(Math.round(goal.x * 2) / 2), gj = ys.indexOf(Math.round(goal.y * 2) / 2);
    if (si < 0 || sj < 0 || gi < 0 || gj < 0) return null;
    const startNode = sj * nx + si, goalNode = gj * nx + gi;

    const N = nx * ny;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const prevDir = new Int8Array(N).fill(-1);  // 0=horiz move, 1=vert move
    const done = new Uint8Array(N);
    dist[startNode] = 0;

    // Lightweight binary heap keyed on f-score.
    const heap: number[] = [], hkey: number[] = [];
    const push = (node: number, f: number) => {
      heap.push(node); hkey.push(f);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (hkey[p] <= hkey[c]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        [hkey[p], hkey[c]] = [hkey[c], hkey[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const ln = heap.pop()!, lk = hkey.pop()!;
      if (heap.length) {
        heap[0] = ln; hkey[0] = lk;
        let p = 0;
        for (;;) {
          const l = 2 * p + 1, r = l + 1; let m = p;
          if (l < heap.length && hkey[l] < hkey[m]) m = l;
          if (r < heap.length && hkey[r] < hkey[m]) m = r;
          if (m === p) break;
          [heap[p], heap[m]] = [heap[m], heap[p]];
          [hkey[p], hkey[m]] = [hkey[m], hkey[p]];
          p = m;
        }
      }
      return top;
    };
    const heur = (i: number, j: number) =>
      Math.abs(xs[i] - xs[gi]) + Math.abs(ys[j] - ys[gj]);
    push(startNode, heur(si, sj));

    let expansions = 0;
    let reached = false;
    while (heap.length) {
      const cur = pop();
      if (done[cur]) continue;
      done[cur] = 1;
      if (cur === goalNode) { reached = true; break; }
      if (++expansions > MAX_EXPANSIONS) break;
      const i = cur % nx, j = (cur / nx) | 0;
      const relax = (ni: number, nj: number, len: number, dir: number) => {
        const nn = nj * nx + ni;
        if (done[nn]) return;
        const turn = prevDir[cur] !== -1 && prevDir[cur] !== dir ? TURN_PENALTY : 0;
        const nd = dist[cur] + len + turn;
        if (nd < dist[nn]) {
          dist[nn] = nd; prev[nn] = cur; prevDir[nn] = dir;
          push(nn, nd + heur(ni, nj));
        }
      };
      if (i + 1 < nx && !hBlocked(xs[i], xs[i + 1], ys[j])) relax(i + 1, j, xs[i + 1] - xs[i], 0);
      if (i - 1 >= 0 && !hBlocked(xs[i - 1], xs[i], ys[j])) relax(i - 1, j, xs[i] - xs[i - 1], 0);
      if (j + 1 < ny && !vBlocked(ys[j], ys[j + 1], xs[i])) relax(i, j + 1, ys[j + 1] - ys[j], 1);
      if (j - 1 >= 0 && !vBlocked(ys[j - 1], ys[j], xs[i])) relax(i, j - 1, ys[j] - ys[j - 1], 1);
    }
    if (!reached) return null;

    const pts: Array<{ x: number; y: number }> = [];
    let n = goalNode;
    while (n !== -1) {
      const i = n % nx, j = (n / nx) | 0;
      pts.push({ x: xs[i], y: ys[j] });
      if (n === startNode) break;
      n = prev[n];
    }
    pts.reverse();
    return pts;
  }

  return { route };
}
