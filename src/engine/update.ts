/* ── 프레임마다 갱신 ── */
import { useFloor } from './building';
import { ceoPose, ceoUpdate } from './ceo';
import { OUT } from './constants';
import { leaveRide, stepRides } from './elevator';
import type { Actor, Floor, Light } from './model';
import { computePose, stepActor } from './people';
import { E } from './state';

const FLICK_OFF = [1,.15,.9,.1,.55,0], FLICK_ON = [0,.7,.15,1];
function updLight(l: Light): void {
  const e = E.clock - l.at;
  if (l.mode === 'off') l.lit = e < 0 ? 1 : e < 0.6 ? FLICK_OFF[Math.floor(e/0.1)] : 0;
  else l.lit = e < 0 ? 0 : e < 0.4 ? FLICK_ON[Math.floor(e/0.1)] : 1;
}
export function update(dt: number): void {
  const byFloor = new Map<Floor | null, Actor[]>(E.FL.map(f => [f, []]));
  for (const a of E.actors.values()) {
    if (a.ride) continue;
    const list = byFloor.get(a.floor);
    if (list) list.push(a);
    else { E.actors.delete(a.id); }       // 층이 없어졌으면(그날이 바뀜) 다음 자료에서 다시 출근한다
  }
  if (E.ceoA && !E.ceoA.ride) { const list = byFloor.get(E.ceoA.floor); if (list) list.push(E.ceoA); }
  const near = new Set<Floor>();
  for (const [f, list] of byFloor) {
    if (!list.length || !f) continue;
    useFloor(f);
    const movers = list.filter(b => b.wait <= 0 && !(!b.path.length && (b.dest.type === 'desk' || b.dest.type === 'lounge' || b.dest.type === 'meet')));
    for (const a of list) {
      stepActor(a, dt, movers);
      if (a.dead) { E.actors.delete(a.id); continue; }
      if (!a.ride && a.walking && a.dest.floor !== a.floor && Math.hypot(a.x - E.DOOR[0], a.y - E.DOOR[1]) < 1.0) near.add(f);
      if (!a.walking) a.pose = a.isCeo ? ceoPose(a) : computePose(a);
    }
  }
  stepRides(dt);
  for (const a of [...E.actors.values()]) if (a.dead) { leaveRide(a); E.actors.delete(a.id); }
  if (E.ceoA && E.ceoA.dead) { leaveRide(E.ceoA); E.ceoA = null; }
  ceoUpdate(dt);
  for (const r of E.rides) { if (r.ph === 'board' && r.from !== OUT) near.add(r.from); if (r.ph === 'arrive' && r.to !== OUT) near.add(r.to); }
  for (const f of E.FL) {
    f.door += ((near.has(f) ? 1 : 0) - f.door) * Math.min(1, dt*7);
    for (const z of f.zones) updLight(z.light);
    updLight(f.L.common); if (f.L.ceo) updLight(f.L.ceo);
  }
}
