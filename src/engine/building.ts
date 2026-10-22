/* ── 건물 ──
   프로젝트 하나 = 층 하나. 그날 처음 보인 순서대로 아래층부터 쌓고, 맨 위는 대표실 층.
   층 안은 칸막이 없이 팀(일 묶음)마다 러그를 깐 책상 섬을 두고, 층마다 낮은 벽으로 두른 작은 휴게실이 있다.
   한 번 놓인 것은 그날 움직이지 않는다(위치 저장). 바닥이 모자라면 모든 층이 옆으로 함께 넓어진다. */
import { buildBackground } from './background';
import { capStore, deskCap, sofaCap } from './capStore';
import { allPeople, makeCeo } from './ceo';
import {
  CEO, CEO_ID, CEO_NX, DESK_PITCH, FLOOR_GAP, HH, HW, MAX_FLOORS, MAX_GROUPS, MEET_ROW, PAD, PLAN_GAP, QMAX, QSTEP, QX, QY,
  SHW, SLAB, WALL, ZONE_COLORS,
} from './constants';
import { resize } from './camera';
import { leaveRide } from './elevator';
import type { Actor, Dest, Floor, Light, LoungeZone, MeetZone, Pt, TeamZone, Wall, Zone } from './model';
import { buildNav } from './nav';
import { E } from './state';
import { renderLift } from './ui';
import { hash } from './util';

export interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Placed { x: number; y: number; w: number; d: number; pod?: { x: number; y: number } }
interface PlanItem {
  key: string; w: number; d: number;
  tw?: number; td?: number; hw?: number; hd?: number; side?: number;
  score?: (x: number, y: number) => number;
  near?: string;
}
interface FloorPlan { shown: { id: string; name: string; floor: string }[]; hks: string[]; placed: Record<string, Placed>; taken: Rect[] }

export function mkLight(): Light { return { lit: E.lightsState ? 0 : 1, mode: E.lightsState ? 'off' : 'on', at: -1e9 }; }
export function floorObj(id: string): Floor {
  let f = E.FLOORS.get(id);
  if (!f) {
    f = { id, ceo: id === CEO_ID, name:'', num:0, dy:0, nx:CEO_NX, ny:10, zones:[], decor:[], lounge:null, rooms:[], nav:null, BGC:null, DARKC:null, darkKey:'',
      L:{ common: mkLight(), ceo: id === CEO_ID ? mkLight() : null }, door:0, walls:[], ceoDoorOpen:false };
    E.FLOORS.set(id, f);
  }
  return f;
}
export function useFloor(f: Floor): void { E.CF = f; E.NX = f.nx; E.NY = f.ny; E.zones = f.zones; E.decor = f.decor; E.lounge = f.lounge; E.rooms = f.rooms; E.nav = f.nav; E.L = f.L; }
export const liftDest = (f: Floor): Dest => ({ type:'lift', key:'lift', floor:f });
export const floorName = (f: Floor | null | undefined): string => f ? `${f.num}F ${f.ceo ? '대표실' : f.name}` : '';
// 화면: 모든 층이 같은 OX·OY(층 안 좌표)를 쓰고, 층마다 dy만큼 아래로 옮겨 그린다
function setBuilding(bnx: number, bny: number, n: number): void {
  E.STOREY = 16*bny + WALL + SLAB + FLOOR_GAP;
  E.OX = PAD + (bny + SHW + 0.4)*HW; E.OY = WALL + 12;
  E.W0 = Math.ceil(E.OX + bnx*HW + PAD);
  E.FH0 = Math.ceil(E.OY + (bnx + bny)*HH + SLAB + 4);
  E.H0 = Math.ceil((n - 1)*E.STOREY + E.FH0 + 44);
}
// 책상은 한 줄에 3개까지 바짝 붙인다. 줄 양쪽 끝에 드나드는 통로를 둔다
const teamSize = (c: number): Pt => [Math.min(Math.max(c, 1), 3)*DESK_PITCH + 1.8, (Math.ceil(Math.max(c, 1)/3) - 1)*1.9 + 2.5];
// 회의 자리는 사람 수(n)만큼. 한 줄 최대 5자리, 줄이 늘면 고르게 나눔
const meetGrid = (n: number) => { n = Math.max(1, n|0); const rows = Math.ceil(n / MEET_ROW); return { rows, cols: Math.ceil(n / rows), n }; };
const huddleN = (h: { n?: number; rows?: number } | undefined): number => h ? (h.n ?? (h.rows || 1)*MEET_ROW) : 2;
const huddleSize = (n: number): Pt => { const { rows, cols } = meetGrid(n); return [Math.max(3.2, 1.5 + cols*0.7), (rows - 1)*1.9 + 2.6]; };
const loungeRows = (n: number) => Math.max(1, Math.ceil(n / 5));
const loungeSize = (n: number): Pt => [4.6, loungeRows(n)*2.5 + 2.3];
// 엘리베이터 앞(앞쪽 왼쪽 모서리)은 비워 둔다. 대표실 층은 대표실과 질문 줄 자리도
export const reservedRects = (ceo: boolean, nx: number, ny: number): Rect[] => [{ x0:0, y0:ny - 3.0, x1:3.6, y1:ny },
  ...(ceo ? [{ x0:0, y0:0, x1:CEO.x1 + 0.5, y1:CEO.y1 + 0.3 }, { x0:0, y0:QY - 0.7, x1:QX + QMAX*QSTEP + 0.2, y1:QY + 1.5 }] : [])];
export const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
function planFloor(f: Floor, shown: FloorPlan['shown'], hks: string[]): { placed: Record<string, Placed>; taken: Rect[] } {
  const cap = E.cap;
  const P = cap.plans[f.id] || (cap.plans[f.id] = { nx:18, ny:Math.max(10, ...Object.values(cap.plans).map(q => q.ny || 10)), pos:{} });
  const items: PlanItem[] = [];
  { const [w, d] = loungeSize(sofaCap(f.id)); items.push({ key:'lounge', w, d, score:(x, y) => x + y*1.2 }); }   // 휴게실은 안쪽 왼편 구석 방
  // 팀 한 덩어리 = 책상 섬 + 바로 앞에 비워 둔 그 팀 회의 자리(평소엔 빈 바닥, 회의가 생기면 테이블이 놓인다)
  for (const g of shown) {
    const [tw, td] = teamSize(deskCap(g.id)), h0 = cap.huddles[g.id + '#0'], [hw, hd] = huddleSize(huddleN(h0));
    const j = (hash(g.id) % 100) / 100, side = hash(g.id + 'side') % 2;
    items.push({ key:'g:' + g.id, w:Math.max(tw, huddleSize(MEET_ROW)[0]), d:td + PLAN_GAP + hd, tw, td, hw, hd, side, score:(x, y) => y + x*0.35 + j*1.6 });
  }
  for (const hk of hks) {
    const h = cap.huddles[hk];
    if (hk === h.gid + '#0' && shown.some(g => g.id === h.gid)) continue;     // 팀 앞에 비워 둔 자리를 쓴다
    const [w, d] = huddleSize(huddleN(h)); items.push({ key:'h:' + hk, w, d, near:'g:' + h.gid });
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    const taken = reservedRects(false, P.nx, P.ny), placed: Record<string, Placed> = {};
    let ok = true;
    const order = items.filter(it => P.pos[it.key]).concat(items.filter(it => !P.pos[it.key]));
    for (const it of order) {
      const inRoom = (x: number, y: number) => x >= 0.5 && y >= 0.5 && x + it.w <= P.nx - 0.5 && y + it.d <= P.ny - 0.5;
      const free = (x: number, y: number) => { const r = { x0:x - PLAN_GAP, y0:y - PLAN_GAP, x1:x + it.w + PLAN_GAP, y1:y + it.d + PLAN_GAP }; return taken.every(o => !overlaps(r, o)); };
      let pos: { x: number; y: number } | null = P.pos[it.key] ?? null;
      if (!(pos && inRoom(pos.x, pos.y) && free(pos.x, pos.y))) {
        const near = it.near ? placed[it.near] : undefined;
        let best: { x: number; y: number } | null = null, bs = Infinity;
        for (let y = 0.5; y + it.d <= P.ny - 0.5; y += 0.5) for (let x = 0.5; x + it.w <= P.nx - 0.5; x += 0.5) {
          if (!free(x, y)) continue;
          const sc = it.score ? it.score(x, y) : near ? Math.hypot(x + it.w/2 - (near.x + near.w/2), y + it.d/2 - (near.y + near.d/2)) : y + x*0.5;
          if (sc < bs) { bs = sc; best = { x, y }; }
        }
        pos = best;
      }
      if (!pos) { ok = false; break; }
      if (it.tw) {
        const w = it.w, tw = it.tw, td = it.td ?? 0, hw = it.hw ?? 0, hd = it.hd ?? 0;
        const tx = pos.x + (it.side ? w - tw : 0), hx = pos.x + (it.side ? 0 : w - hw);
        placed[it.key] = { x:tx, y:pos.y, w:tw, d:td, pod:{ x:pos.x, y:pos.y } };
        placed['h:' + it.key.slice(2) + '#0'] = { x:hx, y:pos.y + td + PLAN_GAP, w:hw, d:hd };
      } else placed[it.key] = { x:pos.x, y:pos.y, w:it.w, d:it.d };
      taken.push({ x0:pos.x, y0:pos.y, x1:pos.x + it.w, y1:pos.y + it.d });
    }
    if (ok) {
      const next: Record<string, { x: number; y: number }> = {};
      for (const it of items) { const v = placed[it.key]; if (v) next[it.key] = v.pod ? { x:v.pod.x, y:v.pod.y } : { x:v.x, y:v.y }; }
      if (JSON.stringify(next) !== JSON.stringify(P.pos)) { P.pos = next; capStore.save(cap); }
      return { placed, taken };
    }
    // 넓히기: 깊이가 모자라 아예 못 들어가는 것이 있으면 안쪽으로, 아니면 옆으로. 깊이가 얕을수록 층 사이가 좁다
    if (items.some(it => it.d > P.ny - 1.0) || attempt % 5 === 4) P.ny += 2; else P.nx += 4;
    capStore.save(cap);
  }
  return { placed:{}, taken:reservedRects(false, P.nx, P.ny) };
}
export function buildLayout(): boolean {
  const cap = E.cap;
  const geoChanged = E.layoutSig !== null;
  E.layoutSig = true;
  const projs = cap.floors.slice(0, MAX_FLOORS);
  const ids = [CEO_ID, ...projs.slice().reverse().map(p => p.id)];
  for (const id of [...E.FLOORS.keys()]) if (!ids.includes(id)) E.FLOORS.delete(id);
  E.FL = ids.map(floorObj);
  E.zoneByGid.clear(); E.roomByKey.clear();
  // 1) 프로젝트 층마다 배치를 정한다
  const plans = new Map<Floor, FloorPlan>();
  for (const p of projs) {
    const f = E.FLOORS.get(p.id)!; f.name = p.name;
    const shown = cap.zones.filter(z => z.floor === p.id).slice(0, MAX_GROUPS), sset = new Set(shown.map(g => g.id));
    const hks = Object.keys(cap.huddles).filter(hk => sset.has(cap.huddles[hk].gid));
    plans.set(f, { shown, hks, ...planFloor(f, shown, hks) });
  }
  // 2) 건물 크기: 깊이(NY)는 모든 층이 같고(층 사이를 좁게), 폭은 층마다 필요한 만큼. 대표실 층은 좁은 꼭대기 층
  let bnx = CEO_NX, bny = 10;
  for (const p of projs) { const P = cap.plans[p.id]; bnx = Math.max(bnx, P.nx); bny = Math.max(bny, P.ny); }
  for (const p of projs) { const P = cap.plans[p.id]; if (P.ny !== bny) { P.ny = bny; capStore.save(cap); } }
  setBuilding(bnx, bny, E.FL.length);
  E.DOORY = bny - 1.1; E.DOOR = [0.12, E.DOORY];
  E.FL.forEach((f, i) => { f.num = E.FL.length - i; f.dy = i*E.STOREY; f.nx = f.ceo ? CEO_NX : cap.plans[f.id].nx; f.ny = bny; if (f.ceo) f.name = '대표실'; });
  // 3) 층마다 구역·가구·길 지도·배경
  E.sprCache.clear();
  for (const f of E.FL) buildFloor(f, plans.get(f));
  E.ALLZ = E.FL.flatMap(f => f.zones);
  E.BG = true;
  renderLift();
  resize();
  return geoChanged;
}
function buildFloor(f: Floor, pl: FloorPlan | undefined): void {
  const cap = E.cap;
  useFloor(f);
  const old = new Map<string, Zone>(f.zones.map(z => [z.key, z]));
  const Z: Zone[] = [], rms: MeetZone[] = [];
  let lz: LoungeZone | null = null;
  if (pl) {
    const { placed } = pl;
    for (const g of pl.shown) {
      const p = placed['g:' + g.id]; if (!p) continue;
      const idx = cap.zones.indexOf(g);
      const slots: Pt[] = [];
      for (let i = 0; i < deskCap(g.id); i++) slots.push([p.x + 0.9 + DESK_PITCH/2 + (i % 3)*DESK_PITCH, p.y + 1.25 + Math.floor(i / 3)*1.9]);
      const x0 = p.x, x1 = p.x + p.w;
      const o = old.get('g:' + g.id);
      const z: TeamZone = { kind:'team', floor:f, key:'g:' + g.id, gid:g.id, name:g.name, color:ZONE_COLORS[idx % ZONE_COLORS.length],
        x0, y0:p.y, x1, y1:p.y + p.d, slots,
        // 자리마다 가까운 줄 끝 통로로 드나든다
        lanes: slots.map(([dx]) => dx < (x0 + x1)/2 ? x0 + 0.4 : x1 - 0.4),
        light: o ? o.light : mkLight(),
        slotOf:new Map(), owners:[], waiting:[], overflow:0 };
      if (o && o.kind === 'team') for (const [id,i] of o.slotOf) if (i < z.slots.length) z.slotOf.set(id, i);
      z.owners = new Array<string | null>(z.slots.length).fill(null);
      Z.push(z); E.zoneByGid.set(z.gid, z);
    }
    { const p = placed.lounge;
      if (p) {
        const ol = old.get('lounge');
        lz = { kind:'lounge', floor:f, key:'lounge', name:'휴게실', color:'#9a927f', x0:p.x, y0:p.y, x1:p.x + p.w, y1:p.y + p.d, seats:[], seatOf:new Map(), items:[], cap:sofaCap(f.id), rows:loungeRows(sofaCap(f.id)),
          light: ol ? ol.light : mkLight() };
        planLounge(lz);
        if (ol && ol.kind === 'lounge') for (const [id,i] of ol.seatOf) if (i < lz.seats.length) lz.seatOf.set(id, i);
        Z.push(lz);
      } }
    // 회의 자리: 그 팀 근처 바닥. 러그 + 낮은 테이블 + 이동식 화이트보드. 사람 수만큼만 (한 줄 최대 5자리)
    for (const hk of pl.hks) {
      const h = cap.huddles[hk], p = placed['h:' + hk]; if (!p) continue;
      const team = cap.zones.find(z => z.id === h.gid);
      const o = old.get('h:' + hk);
      const rz: MeetZone = { kind:'meet', floor:f, hk, key:'h:' + hk, gid:h.gid, name:`${team ? team.name : '공용'} 회의`, color:'#7f93a8', x0:p.x, y0:p.y, x1:p.x + p.w, y1:p.y + p.d, seats:[], seatOf:new Map(),
        light: o ? o.light : mkLight(), pid: null };
      const mg = meetGrid(huddleN(h));
      for (let i = 0; i < mg.n; i++) {
        const r = Math.floor(i / mg.cols), j = i % mg.cols;
        const dx = p.x + 1.15 + j*0.7, dy = p.y + 1.35 + r*1.9;
        rz.seats.push({ dx, dy, x:dx - 0.2, y:dy - 0.55, lane:rz.x1 - 0.35 });
      }
      if (o && o.kind === 'meet') for (const [id,k] of o.seatOf) if (k < rz.seats.length) rz.seatOf.set(id, k);
      Z.push(rz); rms.push(rz); E.roomByKey.set(hk, rz);
    }
  }
  f.zones = Z; f.lounge = lz; f.rooms = rms; f.walls = floorWalls(f);
  // 남는 넓은 바닥에 화분 몇 개
  const taken = pl ? pl.taken : reservedRects(f.ceo, f.nx, f.ny);
  const dec: Pt[] = [], cand: Pt[] = [];
  for (let y = 1.0; y < f.ny - 1.0; y += 1.0) for (let x = 1.0; x < f.nx - 1.0; x += 1.0) cand.push([x, y]);
  cand.sort((a, b) => hash(f.id + a.join(',')) - hash(f.id + b.join(',')));
  const maxDecor = Math.floor(f.nx*f.ny / 45);
  for (const [x, y] of cand) {
    if (dec.length >= maxDecor) break;
    const r = { x0:x - 1.4, y0:y - 1.4, x1:x + 1.4, y1:y + 1.4 };
    if (taken.some(o => overlaps(r, o)) || dec.some(([a, b]) => Math.hypot(a - x, b - y) < 3)) continue;
    dec.push([x, y]);
  }
  f.decor = dec;
  useFloor(f);
  buildNav(); f.nav = E.nav;
  buildBackground(f);
  useFloor(f);
}
/* 낮은 벽: 휴게실만 방으로 두른다(앞쪽 오른편이 문). 대표실 앞 질문 대기실은 벽 없이 바닥 색으로만 구분.
   바깥 벽에 붙은 면은 벽을 세우지 않는다 */
function floorWalls(f: Floor): Wall[] {
  const W: Wall[] = [];
  const h = (y: number, a: number, b: number, l: Light) => { if (b - a > 0.05) W.push({ d:'h', y, a, b, l }); };
  const v = (x: number, a: number, b: number, l: Light) => { if (b - a > 0.05) W.push({ d:'v', x, a, b, l }); };
  const lz = f.lounge;
  if (lz) {
    const l = lz.light, xa = lz.x0 <= 0.7 ? 0.1 : lz.x0, ya = lz.y0 <= 0.7 ? 0.1 : lz.y0;
    if (lz.x0 > 0.7) v(lz.x0, ya, lz.y1, l);
    if (lz.y0 > 0.7) h(lz.y0, xa, lz.x1, l);
    v(lz.x1, ya, lz.y1, l);
    h(lz.y1, xa, lz.x1 - 1.05, l); h(lz.y1, lz.x1 - 0.15, lz.x1, l);
  }
  return W;
}
/* 휴게 공간: 소파 한 줄에 최대 5자리. 왼쪽·오른쪽 가장자리 통로로 들어와 소파 앞 틈을 지나 앉는다 */
function planLounge(z: LoungeZone): void {
  const items: LoungeZone['items'] = [], seats: LoungeZone['seats'] = [];
  let left = z.cap;
  for (let r = 0; r < z.rows; r++) {
    const y0 = z.y0 + 0.3 + r*2.5, n = Math.min(5, left); left -= n;
    const sx = z.x0 + 0.8, cw = 0.6;
    for (let j = 0; j < n; j++) {
      const x = sx + cw*j, px = x + cw/2;
      items.push({ t:'back', x, y:y0, w:cw, k: px + y0 + 0.16 });
      items.push({ t:'seat', x, y:y0 + 0.32, w:cw, k: px + y0 + 0.62 });
      seats.push({ x:px, y:y0 + 0.45, fy:y0 + 1.15, lane: px < z.x0 + 2.3 ? z.x0 + 0.25 : z.x1 - 0.25 });
    }
    const tw = Math.max(0.5, Math.min(n*cw - 0.2, 1.4)), tx = sx + (n*cw - tw)/2, ty = y0 + 1.4;
    items.push({ t:'table', x:tx, y:ty, w:tw, k: tx + tw/2 + ty + 0.27 });
  }
  const yb = z.y0 + 0.3 + z.rows*2.5 + 0.1;
  items.push({ t:'machine', x:z.x0 + 1.2, y:yb, k: z.x0 + 1.5 + yb + 0.25 });
  items.push({ t:'plant', x:z.x0 + 3.2, y:yb + 0.25, k: z.x0 + 3.2 + yb + 0.25 });
  z.items = items; z.seats = seats;
}
export const seatOf = ([dx,dy]: Pt): Pt => [dx - 0.2, dy - 0.55];
export function queuePos(i: number): Pt { return [QX + i*QSTEP, QY]; }
export function waitPos(z: TeamZone, k: number): Pt { const n = Math.max(1, Math.floor((z.x1 - z.x0 - 0.8) / 0.6)); return [z.x0 + 0.6 + (k % n)*0.6, z.y1 - 0.5 + Math.floor(k / n)*0.55]; }
export function regionAt(x: number, y: number): Light {
  for (const z of E.zones) if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return z.light;
  if (E.CF.ceo && x < CEO.x1 && y < CEO.y1) return E.L.ceo!;
  return E.L.common;
}

// 빈 층 철거: 층에 아무도 없고(퇴근하며 걸어가는 사람, 엘리베이터, 순회 중인 대표 포함) 마지막 세션이 나간 지 5분이 지났을 때
export function floorBusy(f: Floor): boolean {
  return allPeople().some(a => a.floor === f || (a.dest && a.dest.floor === f) || (a.ride && (a.ride.from === f || a.ride.to === f)))
    || E.rides.some(r => r.from === f || r.to === f);
}
export function removeFloor(fid: string): void {
  const cap = E.cap;
  // 아직 그 층에 남은 사람(퇴근하는 사람, 순회 중인 대표)과 그 층을 오가는 엘리베이터를 먼저 정리한다
  const f = E.FLOORS.get(fid);
  if (f) {
    const onF = (a: Actor) =>
      a.floor === f || (a.dest && a.dest.floor === f) || (a.ride && (a.ride.from === f || a.ride.to === f));
    for (const a of [...E.actors.values()]) if (onF(a)) { leaveRide(a); E.actors.delete(a.id); }
    if (E.ceoA && onF(E.ceoA)) { leaveRide(E.ceoA); E.ceoA = makeCeo(true); }
    for (const r of [...E.rides]) if (r.from === f || r.to === f) { for (const a of r.riders) { a.ride = null; E.actors.delete(a.id); } E.rides.splice(E.rides.indexOf(r), 1); }
  }
  const gids = new Set(cap.zones.filter(z => z.floor === fid).map(z => z.id));
  cap.floors = cap.floors.filter(p => p.id !== fid);
  cap.zones = cap.zones.filter(z => z.floor !== fid);
  for (const g of gids) { delete cap.desks[g]; delete E.short.desks[g]; }
  for (const hk of Object.keys(cap.huddles)) if (gids.has(cap.huddles[hk].gid)) delete cap.huddles[hk];
  delete cap.sofa[fid]; delete E.short.sofa[fid]; delete cap.plans[fid];
  E.emptySince.delete(fid);
  if (E.ceoA && E.ceoA.tour) E.ceoA.tour = E.ceoA.tour.filter(st => !st.floor || st.floor === 'out' || st.floor.id !== fid);
  for (const g of gids) E.emptySince.delete('z:' + g);
}
// 빈 섬 철거: 그 팀 세션이 모두 나가고 5분, 아직 자리를 쥐고 있거나 그 섬으로 가는 사람이 없을 때. 빈자리는 다른 섬이 그대로 둔다
export function zoneBusy(z: TeamZone): boolean { return z.slotOf.size > 0 || allPeople().some(a => a.dest && 'zone' in a.dest && a.dest.zone === z); }
export function removeZone(gid: string): void {
  const cap = E.cap;
  const z = cap.zones.find(z => z.id === gid); if (!z) return;
  cap.zones = cap.zones.filter(q => q.id !== gid);
  delete cap.desks[gid]; delete E.short.desks[gid];
  const P = cap.plans[z.floor];
  if (P && P.pos) delete P.pos['g:' + gid];
  for (const hk of Object.keys(cap.huddles)) if (cap.huddles[hk].gid === gid) { delete cap.huddles[hk]; if (P && P.pos) delete P.pos['h:' + hk]; }
  for (const [pid, k] of [...E.roomOf]) if (k.startsWith(gid + '#')) E.roomOf.delete(pid);
  E.emptySince.delete('z:' + gid);
}
