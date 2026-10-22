/* ── 동선: 바닥을 0.2칸 격자로 나눈 길찾기 지도 ──
   책상·의자·소파·탁자·화분·대표실을 막힌 칸으로 두고 A*로 가장 짧은 길을 찾은 뒤,
   직선으로 갈 수 있는 구간은 하나로 펴서 자연스럽게 걷게 한다.
   자리에 앉는 마지막 한두 걸음(approach)만 정해진 방향으로 들어간다. */
import { liftDest, useFloor } from './building';
import { CEO, CEO_SEAT, NAV_RES } from './constants';
import type { Actor, Dest, PathPt, Pt } from './model';
import { E } from './state';
import { clamp } from './util';

const cp = (p: PathPt | Pt): PathPt => p.slice() as PathPt;

export function buildNav(): void {
  const { NX, NY } = E;
  const W = Math.ceil(NX / NAV_RES), H = Math.ceil(NY / NAV_RES), B = new Uint8Array(W * H);
  const block = (x0: number, y0: number, x1: number, y1: number) => {
    const i0 = clamp(Math.floor(x0 / NAV_RES), 0, W-1), i1 = clamp(Math.ceil(x1 / NAV_RES) - 1, 0, W-1);
    const j0 = clamp(Math.floor(y0 / NAV_RES), 0, H-1), j1 = clamp(Math.ceil(y1 / NAV_RES) - 1, 0, H-1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) B[j*W + i] = 1;
  };
  block(0, 0, 0.15, NY); block(0, 0, NX, 0.15); block(NX - 0.15, 0, NX, NY); block(0, NY - 0.15, NX, NY);
  for (const [x, y] of E.decor) block(x - 0.3, y - 0.3, x + 0.3, y + 0.3);
  for (const z of E.zones) {
    if (z.kind === 'meet') {
      for (const st of z.seats) { block(st.dx - 0.4, st.dy - 0.37, st.dx + 0.4, st.dy + 0.37); block(st.dx - 0.53, st.dy - 1.0, st.dx + 0.13, st.dy - 0.35); }
      block(z.x0 + 0.1, z.y0 + 0.7, z.x0 + 0.7, z.y0 + 1.5);
    } else if (z.kind === 'team') {
      for (const [dx,dy] of z.slots) { block(dx - 0.72, dy - 0.42, dx + 0.72, dy + 0.42); block(dx - 0.53, dy - 1.0, dx + 0.13, dy - 0.35); }
    } else {
      for (const it of z.items) {
        const w = it.w ?? 0;
        if (it.t === 'back' || it.t === 'seat') block(it.x - 0.03, it.y - 0.03, it.x + w + 0.03, it.y + (it.t === 'back' ? 0.32 : 0.6) + 0.03);
        else if (it.t === 'table') block(it.x - 0.05, it.y - 0.05, it.x + w + 0.05, it.y + 0.6);
        else if (it.t === 'machine') block(it.x - 0.05, it.y - 0.05, it.x + 0.65, it.y + 0.55);
        else if (it.t === 'plant') block(it.x - 0.3, it.y - 0.3, it.x + 0.3, it.y + 0.3);
      }
    }
  }
  if (E.CF.ceo) {
    // 대표실 안: 대표만 드나든다. 유리벽(문 자리 빼고)·책상·책장·화분·의자 등받이를 막는다
    const { x1, y1, door0, door1 } = CEO;
    block(0, y1 - 0.15, door0 - 0.05, y1 + 0.15); block(door1 + 0.05, y1 - 0.15, x1 + 0.15, y1 + 0.15); block(x1 - 0.15, 0, x1 + 0.15, y1 + 0.15);
    block(1.25, 1.8, 3.55, 2.65); block(0, 0.4, 0.6, 2.3); block(x1 - 0.85, 0.2, x1 - 0.25, 0.85); block(1.85, 1.0, 2.95, 1.2);
  }
  for (const w of E.CF.walls) { if (w.d === 'h') block(w.a - 0.1, w.y - 0.2, w.b + 0.1, w.y + 0.2); else block(w.x - 0.2, w.a - 0.1, w.x + 0.2, w.b + 0.1); }
  // 벽은 없지만, 길을 찾을 때 출발·도착 구역이 아닌 남의 러그 위는 되도록 피한다(Z = 구역 번호)
  const Z = new Int16Array(W * H).fill(-1);
  E.zones.forEach((z, zi) => {
    const i0 = clamp(Math.floor(z.x0 / NAV_RES), 0, W-1), i1 = clamp(Math.ceil(z.x1 / NAV_RES) - 1, 0, W-1);
    const j0 = clamp(Math.floor(z.y0 / NAV_RES), 0, H-1), j1 = clamp(Math.ceil(z.y1 / NAV_RES) - 1, 0, H-1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) Z[j*W + i] = zi;
  });
  E.nav = { W, H, B, Z };
}
export const navCell = (x: number, y: number): number => { const nav = E.nav!; return clamp(Math.floor(y / NAV_RES), 0, nav.H-1) * nav.W + clamp(Math.floor(x / NAV_RES), 0, nav.W-1); };
export function segClear(a: PathPt | Pt, b: PathPt | Pt, s: number, t: number): boolean {
  const nav = E.nav!;
  const L = Math.hypot(b[0]-a[0], b[1]-a[1]), n = Math.max(1, Math.ceil(L / (NAV_RES * 0.5)));
  for (let k = 0; k <= n; k++) {
    const c = navCell(a[0] + (b[0]-a[0])*k/n, a[1] + (b[1]-a[1])*k/n);
    if (c === s || c === t) continue;
    if (nav.B[c]) return false;
    const z = nav.Z[c]; if (z >= 0 && z !== nav.Z[s] && z !== nav.Z[t]) return false;
  }
  return true;
}
export function astar(from: PathPt | Pt, to: PathPt | Pt): PathPt[] {
  const nav = E.nav;
  if (!nav) return [cp(to)];
  const { W, H, B } = nav;
  const s = navCell(from[0], from[1]); const t = navCell(to[0], to[1]);
  if (s === t || segClear(from, to, s, t)) return [cp(to)];
  // 가구 안(앉던 자리 등)에서 출발하면 가장 가까운 빈칸으로 먼저 빠져나온다
  if (B[s]) {
    const seen = new Uint8Array(W * H), q = [s]; seen[s] = 1; let esc = -1;
    for (let qi = 0; qi < q.length && qi < 400; qi++) {
      const c = q[qi], cx = c % W, cy = (c / W) | 0;
      if (!B[c] || c === t) { esc = c; break; }
      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny*W + nx; if (!seen[n]) { seen[n] = 1; q.push(n); } }
    }
    if (esc >= 0 && esc !== t) {
      const ep: PathPt = [((esc % W) + 0.5) * NAV_RES, (((esc / W) | 0) + 0.5) * NAV_RES];
      return [ep].concat(astar(ep, to));
    }
  }
  const N = W * H, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const heap: [number, number][] = [], push = (c: number, f: number) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = (): [number, number] => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2*i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const free = (c: number) => !B[c] || c === s || c === t;
  const tx = t % W, ty = (t / W) | 0, zs = nav.Z[s], zt = nav.Z[t];
  const hfn = (c: number) => { const dx = Math.abs(c % W - tx), dy = Math.abs(((c / W) | 0) - ty); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  g[s] = 0; push(s, hfn(s));
  const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
  let found = false;
  while (heap.length) {
    const [, c] = pop();
    if (done[c]) continue; done[c] = 1;
    if (c === t) { found = true; break; }
    const cx = c % W, cy = (c / W) | 0;
    for (const [ox, oy, w] of DIRS) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (done[n] || !free(n)) continue;
      if (ox && oy && (!free(cy*W + nx) || !free(ny*W + cx))) continue;   // 모서리 깎아 지나가지 않기
      const zn = nav.Z[n], ng = g[c] + w * (zn >= 0 && zn !== zs && zn !== zt ? 6 : 1);   // 남의 러그는 6배 비싸게
      if (ng < g[n]) { g[n] = ng; came[n] = c; push(n, ng + hfn(n)); }
    }
  }
  if (!found) return [cp(to)];
  const cells: number[] = []; for (let c = t; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const pts: PathPt[] = cells.map(c => [((c % W) + 0.5) * NAV_RES, (((c / W) | 0) + 0.5) * NAV_RES]);
  pts[0] = cp(from); pts[pts.length - 1] = cp(to);
  const out: PathPt[] = []; let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segClear(pts[i], pts[j], s, t)) j--;
    out.push(pts[j]); i = j;
  }
  return out;
}
function approachOf(dest: Dest): PathPt[] {
  // 세 번째 값 1 = 정해진 방향으로 정확히 들어가는 걸음(앉기·줄 서기·엘리베이터 타기). 이때는 비켜 가지 않는다
  switch (dest.type) {
    case 'desk': { const [sx,sy] = dest.seat; return [[dest.lane, sy], [sx, sy, 1]]; }
    case 'lounge': { const s = dest.info; return [[s.x, s.fy], [s.x, s.y, 1]]; }
    case 'queue': { const [qx,qy] = dest.pt; return [[qx, qy + 0.9], [qx, qy, 1]]; }
    case 'meet': { const s = dest.info; return [[s.lane, s.y], [s.x, s.y, 1]]; }
    case 'wait': case 'help': case 'tour': case 'ceospot': return [[dest.pt[0], dest.pt[1]]];
    case 'ceodesk': return [[3.95, 1.5], [CEO_SEAT[0], CEO_SEAT[1], 1]];
    // 엘리베이터(lift)·퇴근(door): 문 앞에서 문 안쪽으로
    default: return [[0.95, E.DOORY], [E.DOOR[0], E.DOOR[1], 1]];
  }
}
export function pathFrom(a: Actor, dest: Dest, prev: Dest | null, prevAt: string | null): PathPt[] {
  // 다른 층으로 가야 하면 이 층에서는 엘리베이터 문까지만 걷는다
  // (a.floor는 걷는 사람이면 늘 층이 있다)
  const af = a.floor!;
  useFloor(af);
  if (dest.floor !== af) dest = liftDest(af);
  // 앉아 있었거나 앉는(일어나는) 중이었다면, 먼저 그 자리의 통로 쪽 지점으로 정해진 방향으로 나온다
  let exit: PathPt[] = [];
  if (prev && prev.type !== 'door' && prev.floor === af) {
    const ap = approachOf(prev);
    if (!a.path.length && prevAt === prev.key) exit = ap.slice().reverse().slice(1).map(q => [q[0], q[1], 1]);
    else if (a.path.length && a.path[0][2] && ap.length > 1) exit = [[ap[0][0], ap[0][1], 1]];
  }
  const start: PathPt = exit.length ? exit[exit.length - 1] : [a.x, a.y];
  const ap = approachOf(dest);
  const pts = exit.concat(astar(start, ap[0]), ap.slice(1));
  const out: PathPt[] = []; let px = a.x, py = a.y;
  for (const p of pts) { if (Math.hypot(p[0]-px, p[1]-py) < 0.01) continue; out.push(cp(p)); px = p[0]; py = p[1]; }
  return out;
}
