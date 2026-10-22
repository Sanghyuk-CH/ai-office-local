/* ── 엘리베이터 ──
   한 번 타는 것 = 칸 하나(ride). 같은 층에서 같은 층으로 가는 사람은 문이 열려 있는 동안 같이 탄다(최대 4명).
   board: 문이 열리고 칸 안 자리로 들어감 → move: 오르내림 → arrive: 문이 열리고 문 앞까지 걸어 나옴.
   층 번호(c)는 위에서부터 0, 1, 2 … 땅(OUT)은 맨 아래층보다 조금 더 아래 */
import { liftDest } from './building';
import { CAB_SLOTS, OUT, SPEED } from './constants';
import type { Actor, FloorRef, Ride } from './model';
import { pathFrom } from './nav';
import { E } from './state';
import { clamp } from './util';

const cIdx = (f: FloorRef) => f === OUT ? E.FL.length - 1 + 0.5 : Math.max(0, E.FL.indexOf(f));
const rideMoveT = (r: Ride) => 0.6 + 0.5*Math.abs(cIdx(r.to) - cIdx(r.from));
export function boardRide(a: Actor, from: FloorRef, to: FloorRef): Ride {
  let r = E.rides.find(r => r.from === from && r.to === to && r.ph === 'board' && r.riders.length < 4 && r.t < 0.9);
  if (!r) { const c = cIdx(from); r = { from, to, ph:'board', t:0, c, c0:c, riders:[], eta:0 }; E.rides.push(r); }
  const ride = r;
  const slot = [0,1,2,3].find(i => !ride.riders.some(b => b.slot === i)) ?? 0;
  ride.riders.push(a); a.ride = ride; a.slot = slot; a.path = []; a.walking = false; a.atKey = null;
  const [sx, sy] = CAB_SLOTS[slot];
  if (from === OUT) { a.rx = sx; a.ry = E.DOORY + sy; ride.t = Math.max(ride.t, 0.5); }   // 땅에서 타면 이미 칸 안에 서 있다
  else { a.rx = E.DOOR[0]; a.ry = E.DOOR[1]; }
  a.floor = from === OUT ? null : from;
  ride.eta = 0.9 + rideMoveT(ride) + 0.6;
  return ride;
}
export function leaveRide(a: Actor): void {
  if (!a.ride) return;
  const r = a.ride; r.riders = r.riders.filter(b => b !== a); a.ride = null;
  const i = E.rides.indexOf(r); if (!r.riders.length && i >= 0) E.rides.splice(i, 1);
}
// 칸 안에서 걷기: 목표 지점으로 곧장. 도착하면 true
function cabWalk(a: Actor, tx: number, ty: number, dt: number): boolean {
  const dx = tx - a.rx, dy = ty - a.ry, d = Math.hypot(dx, dy), st = SPEED*dt;
  if (d <= Math.max(st, 0.01)) { a.rx = tx; a.ry = ty; a.rwalk = false; return true; }
  a.rx += dx/d*st; a.ry += dy/d*st; a.rwalk = true; a.walkT += dt;
  const sdx = dx - dy; if (Math.abs(sdx) > 1e-4) a.flip = sdx < 0;
  return false;
}
export function stepRides(dt: number): void {
  const rides = E.rides;
  for (const r of [...rides]) {
    r.riders = r.riders.filter(a => a === E.ceoA || E.actors.get(a.id) === a);
    if (!r.riders.length) { const i = rides.indexOf(r); if (i >= 0) rides.splice(i, 1); continue; }
    r.t += dt;
    if (r.ph === 'board') {
      let inside = true;
      for (const a of r.riders) { const [sx, sy] = CAB_SLOTS[a.slot]; if (!cabWalk(a, sx, E.DOORY + sy, dt)) inside = false; }
      if (inside && r.t >= 0.9) { r.ph = 'move'; r.t = 0; r.c0 = cIdx(r.from); }
    } else if (r.ph === 'move') {
      const T = rideMoveT(r), e = clamp(r.t / T, 0, 1), s = e*e*(3 - 2*e);
      r.c = r.c0 + (cIdx(r.to) - r.c0)*s;
      if (e >= 1) { r.ph = 'arrive'; r.t = 0; r.c = cIdx(r.to); }
    } else {
      // 도착: 내릴 사람은 문 앞까지 걸어 나간다. 그사이 목적지가 다른 층으로 바뀌었으면 그대로 타고 간다
      const to = r.to;
      if (to === OUT) { for (const a of r.riders) a.dead = true; const i = rides.indexOf(r); if (i >= 0) rides.splice(i, 1); continue; }
      let out = true;
      for (const a of r.riders) {
        if (a.dest.floor !== to) continue;
        if (!cabWalk(a, E.DOOR[0], E.DOOR[1], dt)) out = false;
      }
      if (out && r.t >= 0.35) {
        for (const a of [...r.riders]) {
          if (a.dest.floor !== to) { leaveRide(a); const nr = boardRide(a, to, a.dest.floor); const [sx, sy] = CAB_SLOTS[a.slot]; a.rx = sx; a.ry = E.DOORY + sy; nr.t = 0.9; continue; }
          leaveRide(a);
          a.floor = to; a.x = E.DOOR[0]; a.y = E.DOOR[1]; a.path = []; a.atKey = null;
          a.path = pathFrom(a, a.dest, liftDest(to), 'lift');
        }
        const i = rides.indexOf(r); if (i >= 0) rides.splice(i, 1);
      }
    }
  }
}
