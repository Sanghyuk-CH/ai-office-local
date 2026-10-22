/* ── 사람 배치 ──
   사람마다 지금 있는 층(a.floor)과 가려는 곳(a.dest, dest.floor)이 있다.
   층이 다르면 먼저 엘리베이터 문으로 걸어가 타고, 내리면 문에서 목적지까지 걷는다.
   출근은 땅에서 엘리베이터를 타고 올라오고, 퇴근은 엘리베이터를 타고 내려가 사라진다. */
import { queuePos, seatOf, waitPos } from './building';
import { capStore, deskCap, sofaCap } from './capStore';
import { CEO_ID, GROW_AFTER_MS, OUT, QMAX, R_AV, SPEED } from './constants';
import { boardRide, leaveRide } from './elevator';
import type { Actor, Dest, Floor, Pose, Pt, Question, Session, Want } from './model';
import { astar, navCell, pathFrom, segClear } from './nav';
import { sheetFor } from './sprites';
import { E } from './state';
import type { Tone } from './types';
import { fmtMin, hash, tms } from './util';

export function minsSince(v: string | undefined): number { const t = tms(v); return t == null ? 0 : (E.dataNow - t) / 60000; }
export function isSweaty(s: Session): boolean { return s.state === 'blocked' || ((s.state || 'working') === 'working' && minsSince(s.startedAt) >= 40); }
export interface StateInfo { label: string; cls: Tone; time: string }
export function stateInfo(s: Session, q: Question | undefined): StateInfo {
  if (q) return { label:'질문 대기', cls:'q', time:fmtMin(minsSince(q.askedAt)) };
  const run = minsSince(s.startedAt), since = minsSince(s.stateSince || s.startedAt);
  switch (s.state) {
    case 'reporting': return { label:'결과 보고', cls:'ok', time:fmtMin(since) };
    case 'blocked': return { label:'막힘', cls:'bad', time:fmtMin(run) };
    case 'idle': return { label: since >= 15 ? '대기 · 조는 중' : '대기 · 커피', cls:'idle', time:fmtMin(since) };
    default: return run >= 40 ? { label:'작업 중 · 40분 넘음', cls:'warn', time:fmtMin(run) } : { label:'작업 중', cls:'work', time:fmtMin(run) };
  }
}
export function computePose(a: Actor): Pose {
  const w = a.want; if (!w) return { f:10 };
  const dt = a.dest.type;
  if (dt === 'queue' && w.type === 'queue' && w.q) {
    const m = minsSince(w.q.askedAt);
    if (m >= 8) return { f:11, fx:'sweat2' };
    if (m >= 3) return { f:10, fx:'sweat' };
    return { f:10 };
  }
  if (dt === 'wait' || dt === 'help' || !w.s) return { f:10 };
  const s = w.s, ph = a.phase, since = minsSince(s.stateSince || s.startedAt), clock = E.clock;
  if (dt === 'lounge') return since < 15 ? { f:8, fx:'steam' } : { f:9, fx:'zzz' };
  switch (s.state) {
    case 'reporting': return { f:[6,7][Math.floor(clock*3 + ph*2) % 2], fx:'stars' };
    case 'blocked': return { f:[4,5][Math.floor(clock*1.5 + ph*2) % 2], fx:'sweat2' };
    case 'idle': return since < 15 ? { f:8, fx:'steam' } : { f:9, fx:'zzz' };
    default: return { f:[4,5][Math.floor(clock*6 + ph*2) % 2], fx: minsSince(s.startedAt) >= 40 ? 'sweat' : null };
  }
}

export const LEAVE: Dest = { type:'door', key:'door', floor:OUT };
function makeActor(id: string, w: Want, f: Floor): Actor {
  return { id, floor:f, x:E.DOOR[0], y:E.DOOR[1], path:[], dest:LEAVE, atKey:null, alpha:1, wait:0, walkT:0, walking:false, flip:false,
    dead:false, want:w, phase:(hash(id) % 100) / 100, sheet:sheetFor(id, w.s && w.s.parent), pose:{ f:10 }, sx:0, sy:0, bx:0, by:0, frame:10, bubble:null, ride:null,
    slot:0, rx:0, ry:0, rwalk:false, yieldT:0, replanT:0, dark:0 };
}
function destFor(id: string, w: Want): Dest | null {
  if (w.type === 'queue') return w.idx < QMAX ? { type:'queue', key:'q:' + w.idx, pt:queuePos(w.idx), floor:E.FLOORS.get(CEO_ID)! } : null;
  const m = E.meetOf.get(id), mz = m && E.roomByKey.get(m.key);
  if (mz && mz.seatOf.has(id)) { const k = mz.seatOf.get(id)!, st = mz.seats[k]; return { type:'meet', key:'m:' + mz.key + ':' + k, seat:[st.x, st.y], info:st, zone:mz, slot:k, floor:mz.floor }; }
  const l = E.loungeOf.get(id), lf = E.FLOORS.get(w.s.proj);
  if (l != null && lf && lf.lounge) { const s = lf.lounge.seats[l]; return { type:'lounge', key:'l:' + l, seat:[s.x, s.y], info:s, zone:lf.lounge, slot:l, floor:lf }; }
  const z = E.zoneByGid.get(w.s.gid); if (!z) return null;
  if (w.s.parent) {
    // 회의 자리가 생기기 전: 상위 세션 책상 옆 통로에 서서 일한다
    const pi = z.slotOf.get(w.s.parent), sibs = (E.DATA!.subsOf.get(w.s.parent) || []), k = sibs.indexOf(id);
    if (pi != null && k >= 0 && k < 4) { const [, dy] = z.slots[pi]; return { type:'help', key:'h:' + z.key + ':' + pi + ':' + k, pt:[z.lanes[pi], dy - 0.55 + k*0.45], zone:z, floor:z.floor }; }
  }
  const i = z.slotOf.get(id);
  if (i == null) { const k = z.waiting.indexOf(id); return k < 0 ? null : { type:'wait', key:'w:' + z.key + ':' + k, pt:waitPos(z, k), zone:z, floor:z.floor }; }
  return { type:'desk', key:'d:' + z.key + ':' + i, seat:seatOf(z.slots[i]), lane:z.lanes[i], zone:z, slot:i, floor:z.floor };
}
export const destPoint = (d: Dest): Pt => {
  switch (d.type) {
    case 'desk': case 'lounge': case 'meet': return d.seat;
    case 'queue': case 'wait': case 'help': case 'tour': case 'ceodesk': case 'ceospot': return d.pt;
    default: return E.DOOR;
  }
};
function place(a: Actor, dest: Dest): void {
  const p = destPoint(dest); leaveRide(a);
  a.floor = dest.floor === OUT ? null : dest.floor;
  a.x = p[0]; a.y = p[1]; a.dest = dest; a.atKey = dest.key; a.path = []; a.alpha = 1; a.wait = 0;
}
export function setDest(a: Actor, dest: Dest, text: string | null): void {
  const prev = a.dest, prevAt = a.atKey;
  if (text) a.bubble = { text, until: E.clock + 2.6 };
  a.dest = dest;
  if (a.ride) { a.atKey = null; return; }          // 타고 있으면 내린 뒤에 새 목적지로 간다
  const wasQueue = prevAt && prevAt.startsWith('q:') && !a.path.length && prev.floor === a.floor;
  if (wasQueue && dest.type === 'queue' && dest.floor === a.floor && Math.abs(dest.pt[1] - a.y) < 0.01) a.path = [[dest.pt[0], dest.pt[1], 1]];
  else a.path = pathFrom(a, dest, prev, prevAt);
  a.atKey = null;
}
const MOVE_TEXT: Record<string, string> = { 'desk>lounge':'잠깐 쉴게요', 'lounge>desk':'다시 일합니다', 'desk>queue':'질문 있습니다!', 'lounge>queue':'질문 있습니다!',
  'desk>meet':'회의 자리로 갑니다', 'help>meet':'회의 자리로 갑니다', 'lounge>meet':'회의 자리로 갑니다', 'wait>meet':'회의 자리로 갑니다', 'meet>desk':'회의 끝!', 'meet>lounge':'회의 끝!',
  'meet>queue':'질문 있습니다!', 'queue>meet':'답을 받았어요!', 'help>queue':'질문 있습니다!',
  'wait>queue':'질문 있습니다!', 'queue>desk':'답을 받았어요!', 'queue>lounge':'답을 받았어요!', 'wait>desk':'자리 생겼다!', 'queue>wait':'답을 받았어요!' };
function seatPeople(): void {
  const DATA = E.DATA!;
  for (const z of E.ALLZ) {
    if (z.kind !== 'team') continue;
    const members = DATA.sessions.filter(s => s.gid === z.gid && !s.parent).map(s => s.id), mset = new Set(members);
    for (const id of [...z.slotOf.keys()]) if (!mset.has(id)) z.slotOf.delete(id);
    const used = new Set(z.slotOf.values());
    for (const id of members) {
      if (z.slotOf.has(id)) continue;
      let i = 0; while (used.has(i)) i++;
      if (i < z.slots.length) { z.slotOf.set(id, i); used.add(i); }
    }
    z.owners = new Array<string | null>(z.slots.length).fill(null);
    for (const [id,i] of z.slotOf) z.owners[i] = id;
    // 책상이 없는 상위 세션, 그리고 상위 세션 책상이 없는 하위 작업자는 구역 앞에서 기다린다
    const loose = DATA.sessions.filter(s => s.gid === z.gid && s.parent && !z.slotOf.has(s.parent)).map(s => s.id);
    z.waiting = members.filter(id => !z.slotOf.has(id)).concat(loose).filter(id => !DATA.pq.has(id) && !E.loungeOf.has(id) && !E.meetOf.has(id));
    z.overflow = members.filter(id => !z.slotOf.has(id)).length;
  }
}
function seatLounge(): void {
  const DATA = E.DATA!;
  E.loungeOf = new Map();
  for (const f of E.FL) {
    const lz = f.lounge; if (!lz) continue;
    const idle = DATA.sessions.filter(s => s.proj === f.id && s.state === 'idle' && !DATA.pq.has(s.id) && !E.meetOf.has(s.id)).sort((a,b) => (tms(a.stateSince) ?? 0) - (tms(b.stateSince) ?? 0));
    const iset = new Set(idle.map(s => s.id));
    for (const id of [...lz.seatOf.keys()]) if (!iset.has(id)) lz.seatOf.delete(id);
    for (const [id,i] of lz.seatOf) E.loungeOf.set(id, i);
    const used = new Set(lz.seatOf.values());
    for (const s of idle) {
      if (E.loungeOf.has(s.id)) continue;
      let i = 0; while (used.has(i)) i++;
      if (i >= lz.seats.length) break;
      lz.seatOf.set(s.id, i); E.loungeOf.set(s.id, i); used.add(i);
    }
  }
}
export function reconcile(desired: Map<string, Want>, initial: boolean, regeo: boolean): void {
  seatMeetings(); seatLounge(); seatPeople();
  for (const [id,w] of desired) {
    let a = E.actors.get(id);
    const dest = destFor(id, w);
    if (!a) {
      if (!dest) continue;
      a = makeActor(id, w, dest.floor as Floor); E.actors.set(id, a);
      if (initial) place(a, dest);
      else {
        a.dest = dest;
        const bubble = { text: w.type === 'queue' ? '질문 있습니다!' : dest.type === 'wait' ? '출근했는데 자리가 없어요' : '출근합니다!', until: 0 };
        a.bubble = bubble;
        const ride = boardRide(a, OUT, dest.floor);
        bubble.until = E.clock + ride.eta + 1.8;
      }
    } else if (!dest) { leaveRide(a); E.actors.delete(id); continue; }
    else if (initial) { if (a.dest.key !== dest.key || a.floor !== dest.floor) place(a, dest); else a.dest = dest; }
    else if (regeo && a.dest.key === dest.key && a.dest.floor === dest.floor) {
      // 배치가 다시 짜였을 때: 자리가 그대로면 그대로 두고, 바뀌었으면 지금 위치에서 새 자리로 걸어간다
      const p0 = destPoint(a.dest), p1 = destPoint(dest), same = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) < 0.01;
      if (a.ride || (same && !a.path.length)) a.dest = dest;
      else { a.dest = dest; a.path = pathFrom(a, dest, null, null); a.atKey = null; }
    }
    else if (a.dest.key === dest.key && a.dest.floor === dest.floor) a.dest = dest;
    else setDest(a, dest, MOVE_TEXT[a.dest.type + '>' + dest.type] || null);
    a.want = w;
  }
  for (const [id,a] of E.actors) {
    if (desired.has(id)) continue;
    if (initial) { leaveRide(a); E.actors.delete(id); continue; }
    if (a.dest.type !== 'door') setDest(a, LEAVE, '퇴근합니다!');
    else if (regeo && !a.ride) a.path = pathFrom(a, a.dest, null, null);
  }
}

/* 회의: 하위 작업자가 생기면 바로 그 팀 회의 자리를 만들어 팀을 모으고, 마지막 하위 작업자가 나가면 바로 치운다 */
export function updateMeetings(): void {
  const DATA = E.DATA!, cap = E.cap;
  const subsOf = new Map<string, string[]>();
  for (const s of DATA.sessions) if (s.parent && DATA.smap.has(s.parent)) { if (!subsOf.has(s.parent)) subsOf.set(s.parent, []); subsOf.get(s.parent)!.push(s.id); }
  const active = DATA.dayEnded ? [] : DATA.sessions.filter(s => !s.parent && subsOf.has(s.id)).map(s => s.id);
  const aset = new Set(active);
  for (const pid of [...E.roomOf.keys()]) if (!aset.has(pid)) E.roomOf.delete(pid);
  const next: Record<string, { gid: string; n: number }> = {};
  for (const pid of active) {
    const gid = DATA.smap.get(pid)!.gid;
    if (!E.roomOf.has(pid)) { const used = new Set(E.roomOf.values()); let n = 0; while (used.has(`${gid}#${n}`)) n++; E.roomOf.set(pid, `${gid}#${n}`); }
    next[E.roomOf.get(pid)!] = { gid, n: 1 + subsOf.get(pid)!.length };
  }
  if (JSON.stringify(next) !== JSON.stringify(cap.huddles)) { cap.huddles = next; capStore.save(cap); }
  E.meetOf = new Map();
  for (const pid of active) { const key = E.roomOf.get(pid)!; E.meetOf.set(pid, { key, pid }); for (const id of subsOf.get(pid)!) E.meetOf.set(id, { key, pid }); }
  DATA.subsOf = subsOf;
}
function seatMeetings(): void {
  const DATA = E.DATA!;
  for (const z of E.ALLZ) {
    if (z.kind !== 'meet') continue;
    const pid = [...E.roomOf.entries()].find(([, k]) => k === z.hk)?.[0];
    const members = pid ? [pid, ...(DATA.subsOf.get(pid) || [])] : [];
    const mset = new Set(members);
    for (const id of [...z.seatOf.keys()]) if (!mset.has(id)) z.seatOf.delete(id);
    const used = new Set(z.seatOf.values());
    for (const id of members) {
      if (z.seatOf.has(id)) continue;
      let i = 0; while (used.has(i)) i++;
      if (i < z.seats.length) { z.seatOf.set(id, i); used.add(i); }
    }
    z.pid = pid || null;
  }
}
/* 자리 늘리기: 1분 넘게 모자라면 필요한 만큼. 줄이지는 않고, 마감 때 기본값으로 */
export function checkGrowth(): void {
  const DATA = E.DATA!, cap = E.cap, short = E.short, dataNow = E.dataNow;
  const notes: string[] = [];
  for (const g of cap.zones) {
    const need = DATA.sessions.filter(s => s.gid === g.id && !s.parent).length, c = deskCap(g.id);   // 하위 작업자는 책상을 쓰지 않는다
    if (need > c) {
      if (short.desks[g.id] == null) short.desks[g.id] = dataNow;
      else if (dataNow - short.desks[g.id] >= GROW_AFTER_MS) { cap.desks[g.id] = need; delete short.desks[g.id]; notes.push(`${g.name} 책상 ${need - c}개`); }
    } else delete short.desks[g.id];
  }
  for (const p of cap.floors) {
    const idleN = DATA.sessions.filter(s => s.proj === p.id && s.state === 'idle' && !DATA.pq.has(s.id)).length, c = sofaCap(p.id);
    if (idleN > c) {
      if (short.sofa[p.id] == null) short.sofa[p.id] = dataNow;
      else if (dataNow - short.sofa[p.id] >= GROW_AFTER_MS) { notes.push(`${p.name} 소파 ${idleN - c}자리`); cap.sofa[p.id] = idleN; delete short.sofa[p.id]; }
    } else delete short.sofa[p.id];
  }
  if (notes.length) {
    capStore.save(cap);
    E.growNote = { text: `${notes.join(', ')}를 들여놓았습니다`, until: E.clock + 4 };
  }
}

/* ── 걷기와 비켜 가기 (같은 층 사람끼리) ──
   - 다음 지점으로 곧장 가되, 0.6칸 안에 다른 사람이 있으면 밀려나듯 비켜 간다
   - 앞에 사람이 있으면 각자 오른쪽으로 비켜서 엇갈린다
   - 아주 가까이 마주치면 우선순위가 낮은 쪽이 잠깐 서서 기다리고, 1.5초가 넘으면 그냥 지나간다
   - 비켜 가다 가구에 막힐 것 같으면 그 걸음은 원래 방향으로 걷고, 길에서 많이 벗어나면 길을 다시 찾는다 */
const rank = (a: Actor) => hash(a.id) % 1000;
export function stepActor(a: Actor, dt: number, movers: Actor[]): void {
  if (a.wait > 0) { a.wait -= dt; return; }
  if (!a.path.length) {
    a.walking = false;
    if (a.dest.floor !== a.floor) { boardRide(a, a.floor!, a.dest.floor); return; }   // 엘리베이터 문 앞에 왔다
    a.atKey = a.dest.key;
    return;
  }
  const p = a.path[0], tx = p[0], ty = p[1], st = SPEED*dt;
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
  a.walking = true; a.walkT += dt;
  if (d <= Math.max(st, 0.02)) {
    a.x = tx; a.y = ty; a.path.shift(); a.yieldT = 0;
    if (!a.path.length && a.dest.floor === a.floor) a.atKey = a.dest.key;
    return;
  }
  const ux = dx/d, uy = dy/d;
  let vx = ux, vy = uy, slow = 1;
  if (!p[2]) {
    const rx = -uy, ry = ux;
    let px = 0, py = 0, hold = false;
    for (const b of movers) {
      if (b === a) continue;
      const ox = a.x - b.x, oy = a.y - b.y, od = Math.hypot(ox, oy);
      if (od >= R_AV || od < 1e-4) continue;
      const w = (R_AV - od) / R_AV;
      px += ox/od * w; py += oy/od * w;
      const ahead = -(ox*ux + oy*uy) / od;          // 1이면 바로 앞, -1이면 바로 뒤
      if (ahead > 0.3) { px += rx * w * ahead; py += ry * w * ahead; }
      if (ahead > 0.5 && od < 0.32 && (!b.walking || rank(a) < rank(b))) hold = true;
    }
    vx = ux + px*1.4; vy = uy + py*1.4;
    let vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    if (vx*ux + vy*uy < 0.25) { vx = (vx + ux)/2; vy = (vy + uy)/2; vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl; }
    if (hold) { a.yieldT = (a.yieldT || 0) + dt; if (a.yieldT < 1.5) slow = 0.12; } else a.yieldT = 0;
  }
  let nx = a.x + vx*st*slow, ny = a.y + vy*st*slow;
  const nav = E.nav;
  if (!p[2] && nav) {
    const c = navCell(nx, ny);
    if (nav.B[c] && c !== navCell(a.x, a.y)) { nx = a.x + ux*st*slow; ny = a.y + uy*st*slow; }
  }
  const sdx = (nx - a.x) - (ny - a.y); if (Math.abs(sdx) > 1e-4) a.flip = sdx < 0;
  a.x = nx; a.y = ny;
  if (!p[2] && nav) {
    a.replanT = (a.replanT || 0) - dt;
    if (a.replanT <= 0) {
      a.replanT = 0.3;
      if (!segClear([a.x, a.y], [tx, ty], navCell(a.x, a.y), navCell(tx, ty))) a.path.splice(0, 1, ...astar([a.x, a.y], [tx, ty]));
    }
  }
}
