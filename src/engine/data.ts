/* 자료 읽기: 세션마다 프로젝트(층)와 팀(섬)을 정한다
   - project: 세션에 있으면 그것, 없으면 상위 세션 → groups[].project 순서로 찾고, 그래도 없으면 '기본 프로젝트'
   - 하위 작업자는 언제나 상위 세션과 같은 층·같은 팀 */
import { buildLayout, floorBusy, removeFloor, removeZone, zoneBusy } from './building';
import { capStore, deskCap, resetCap } from './capStore';
import { makeCeo } from './ceo';
import { CEO_ID, DEFAULT_PROJECT, EMPTY_FLOOR_MS, MAX_FLOORS, OUT, QMAX } from './constants';
import { boardRide } from './elevator';
import type { Light, Question, Session, Want } from './model';
import { checkGrowth, LEAVE, reconcile, setDest, updateMeetings } from './people';
import { ceoSheet } from './sprites';
import { E } from './state';
import type { StatusJson } from './types';
import { renderBoard, renderStats, setSlice, syncDemo } from './ui';
import { dayId, hash, tms } from './util';

type Raw = Record<string, unknown>;
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v : []) as Raw[];
const strOrNull = (v: unknown): string | null => v == null ? null : String(v);

function apply(d: StatusJson): void {
  E.dataNow = tms(d.updatedAt) ?? Date.now();
  const dataNow = E.dataNow;
  const projects = arr(d.projects).filter(p => p && p.id != null).map(p => ({ id:String(p.id), name:String(p.name ?? p.id) }));
  const groups = arr(d.groups).filter(g => g && g.id != null).map(g => ({ id:String(g.id), name:String(g.name ?? g.id), project: strOrNull(g.project) }));
  const sessions: Session[] = (d.sessions as unknown as Raw[]).filter(s => s && s.id != null).map(s => ({ ...s, id:String(s.id), group: strOrNull(s.group), parent: strOrNull(s.parent), project: strOrNull(s.project) }) as unknown as Session);
  const smap = new Map(sessions.map(s => [s.id, s]));
  const gProj = new Map<string, string>(); for (const g of groups) if (g.project && !gProj.has(g.id)) gProj.set(g.id, g.project);
  const pName = new Map(projects.map(p => [p.id, p.name]));
  const resolve = (s: Session, depth = 0): void => {
    if (s.proj) return;
    const ps = s.parent && depth < 4 ? smap.get(s.parent) : null;
    if (ps) { resolve(ps, depth + 1); s.proj = ps.proj; s.gid = ps.gid; s.group = ps.group; return; }
    s.proj = s.project || (s.group != null ? gProj.get(s.group) : undefined) || DEFAULT_PROJECT;
    s.gid = s.proj + '/' + (s.group ?? '_');
  };
  sessions.forEach(s => resolve(s));
  const teamName = (s: Session) => { const g = groups.find(g => g.id === s.group && (!g.project || g.project === s.proj)); return g ? g.name : (s.group ?? '공용'); };
  const projName = (id: string) => pName.get(id) || (id === DEFAULT_PROJECT ? '기본 프로젝트' : id);
  const questions: Question[] = arr(d.questions).filter(q => q && q.sessionId != null)
    .map(q => ({ ...q, sessionId:String(q.sessionId) }) as unknown as Question).sort((a,b) => (tms(a.askedAt) ?? 0) - (tms(b.askedAt) ?? 0));
  const pq = new Map<string, Question>(), qcount = new Map<string, number>();
  for (const q of questions) { if (!pq.has(q.sessionId)) pq.set(q.sessionId, q); qcount.set(q.sessionId, (qcount.get(q.sessionId) || 0) + 1); }
  for (const s of sessions) { const ps = s.parent ? smap.get(s.parent) : undefined; if (!s.app && ps) s.app = ps.app; }
  const DATA = E.DATA = { sessions, smap, questions, pq, qcount, groups, projects, dayEnded: !!d.dayEnded, subsOf:new Map<string, string[]>(),
    apps: new Set(sessions.map(s => s.app).filter((a): a is string => !!a)) };

  // 그날 상태: 마감되면 지우고, 다음 날(또는 다른 날짜·다른 자료) 자료가 오면 기본값부터
  const day = dayId(dataNow);
  if (DATA.dayEnded) { if (!E.capResetPending) { E.capResetPending = true; capStore.clear(); } }
  else {
    if (E.capResetPending || E.cap.day !== day || E.cap.source !== E.srcMode) { resetCap(day); E.capResetPending = false; }
    const cap2 = E.cap;   // resetCap이 새 객체로 바꿨을 수 있다
    // 층과 섬: 그 프로젝트·팀의 세션이 처음 생기면 만들고, 비고 나서 5분이 지나면 철거
    let changed = false;
    for (const s of sessions) {
      if (!cap2.floors.some(p => p.id === s.proj)) { cap2.floors.push({ id:s.proj, name:projName(s.proj) }); changed = true; }
      if (!cap2.zones.some(z => z.id === s.gid)) { cap2.zones.push({ id:s.gid, name:teamName(s), floor:s.proj }); changed = true; }
    }
    for (const p of cap2.floors) { const n = pName.get(p.id); if (n && n !== p.name) { p.name = n; changed = true; } }
    for (const z of cap2.zones) { const s = sessions.find(s => s.gid === z.id && !s.parent); const n = s && teamName(s); if (n && n !== z.name) { z.name = n; changed = true; } }
    const liveProj = new Set(sessions.map(s => s.proj));
    for (const p of E.cap.floors.slice()) {
      if (liveProj.has(p.id)) { E.emptySince.delete(p.id); continue; }
      if (!E.emptySince.has(p.id)) { E.emptySince.set(p.id, dataNow); continue; }
      const f = E.FLOORS.get(p.id), waited = dataNow - E.emptySince.get(p.id)!;
      if (waited < EMPTY_FLOOR_MS) continue;
      // 보통은 마지막 사람이 엘리베이터를 타고 나갈 때까지 기다린다. 다만 탭이 가려져 그림이 멈춰 있거나
      // 30초를 더 기다려도 비지 않으면 그대로 철거한다(사람이 멈춘 채로 층이 영영 남지 않게)
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (f && floorBusy(f) && !hidden && waited < EMPTY_FLOOR_MS + 30000) continue;
      removeFloor(p.id); changed = true;
    }
    const liveGid = new Set(sessions.map(s => s.gid));
    for (const z of E.cap.zones.slice()) {
      const k = 'z:' + z.id;
      if (liveGid.has(z.id)) { E.emptySince.delete(k); continue; }
      if (!E.emptySince.has(k)) { E.emptySince.set(k, dataNow); continue; }
      const zz = E.zoneByGid.get(z.id);
      if (dataNow - E.emptySince.get(k)! < EMPTY_FLOOR_MS || (zz && zoneBusy(zz))) continue;
      removeZone(z.id); changed = true;
    }
    if (changed) capStore.save(E.cap);
    checkGrowth();
  }
  updateMeetings();

  const capN = E.cap;
  const key = JSON.stringify([capN.floors.slice(0, MAX_FLOORS), capN.zones.map(g => [g.id, g.name, g.floor, deskCap(g.id)]), capN.sofa, capN.huddles]);
  let regeo = false;
  if (key !== E.layoutKey) {
    // 건물이 커지거나 층이 늘어도 이미 있던 층은 같은 칸 좌표에 남는다. 화면 매핑만 옛것에서 새것으로 부드럽게 옮긴다
    const view = E.view;
    const anchorId = capN.floors.length ? capN.floors[0].id : CEO_ID;
    const fa = E.FLOORS.get(anchorId), before = (!E.initialApply && E.BG && fa) ? { a: view.kz / view.u, bx: view.ox / view.u, by: view.oy / view.u, ox: E.OX, oy: E.OY + fa.dy } : null;
    regeo = buildLayout(); E.layoutKey = key;
    const fb = E.FLOORS.get(anchorId);
    if (regeo && before && fb) {
      const dx = E.OX - before.ox, dy = E.OY + fb.dy - before.oy;
      if (E.cam.zoom > 1.001) { E.cam.cx = (E.cam.cx ?? 0) + dx; E.cam.cy = (E.cam.cy ?? 0) + dy; }
      E.tween = { a: before.a, bx: before.bx - dx * before.a, by: before.by - dy * before.a, t0: performance.now() };
    }
  }

  const desired = new Map<string, Want>();
  let qi = 0;
  for (const [sid,q] of pq) desired.set(sid, { type:'queue', idx:qi++, q, s: smap.get(sid) || { id:sid, name: q.from || '알 수 없는 세션', state:'idle', proj:DEFAULT_PROJECT, gid:'', project:null, group:null, parent:null } });
  E.queueOverflow = Math.max(0, pq.size - QMAX);
  for (const s of sessions) if (!pq.has(s.id)) desired.set(s.id, { type:'desk', s });
  reconcile(desired, E.initialApply, regeo && !E.initialApply);

  if (DATA.dayEnded !== E.lightsState) {
    const off = DATA.dayEnded;
    // 끌 때: 아래층부터 구역마다, 층 복도까지 끄고 위층으로. 대표실 층이 마지막. 켤 때는 거꾸로
    let seq: Light[] = [];
    for (const f of E.FL.slice().reverse()) if (!f.ceo) seq.push(...f.zones.map(z => z.light), f.L.common);
    const top = E.FLOORS.get(CEO_ID)!; seq.push(top.L.common, top.L.ceo!);
    if (!off) seq = seq.reverse();
    seq.forEach((l,i) => { l.mode = off ? 'off' : 'on'; l.at = (E.initialApply || E.lightsState === null) ? -1e9 : E.clock + 1.0 + i*0.7; });
    E.lightsState = off;
  }
  // 대표: 하루가 열려 있으면 대표실에 있고(처음엔 바로 자리에, 그 뒤엔 엘리베이터로 출근), 마감되면 퇴근
  if (!DATA.dayEnded && !E.ceoA && E.FLOORS.get(CEO_ID)) {
    const c = E.ceoA = makeCeo(E.initialApply);
    if (!E.initialApply) { c.commute = true; c.sheet = ceoSheet(false); const b = c.bubble = { text:'출근합니다!', until:0 }; const r = boardRide(c, OUT, E.FLOORS.get(CEO_ID)!); b.until = E.clock + r.eta + 1.8; }
  } else if (DATA.dayEnded && E.ceoA && E.ceoA.dest.type !== 'door') { E.ceoA.tour = null; if (E.initialApply) E.ceoA = null; else { E.ceoA.commute = true; E.ceoA.sheet = ceoSheet(false); setDest(E.ceoA, LEAVE, '퇴근합니다!'); } }
  E.initialApply = false;
  renderBoard(); renderStats(); syncDemo();
}

/* ── 자료 읽기 ──
   sim: 예시 / push: 바깥에서 밀어 넣기(Tauri 이벤트 또는 office.push). 5초 규칙은 똑같이 적용 */
export function ingest(text: StatusJson | string): void {
  let d: StatusJson;
  try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch { return; }
  if (!d || !Array.isArray(d.sessions)) return;
  const raw = typeof text === 'string' ? text : JSON.stringify(d);
  const key = d.updatedAt ? String(d.updatedAt) + '|' + (d.seq ?? '') : 'h' + hash(raw);
  if (key === E.lastKey) return;          // 같은 자료면 갱신으로 치지 않음
  E.lastKey = key; E.lastFresh = performance.now(); E.hasData = true;
  apply(d);
}
export function poll(): void {
  try {
    if (E.srcMode === 'sim') { if (!E.sim.cut) { E.sim.tick(); ingest(JSON.stringify(E.sim.snapshot())); } }
  } catch { /* 실패하면 갱신 없음으로 남겨 5초 뒤 '확인 중'이 됨 */ }
}
export function resetSource(): void {
  E.lastKey = null; E.hasData = false; E.lastFresh = -1e9; E.initialApply = true; E.lightsState = null; E.sel = null;
  setSlice('selected', null);
  E.actors.clear(); E.rides.length = 0; E.ceoA = null; E.loungeOf = new Map();
  for (const z of E.ALLZ) {
    if (z.kind === 'team') { z.slotOf.clear(); z.owners.fill(null); z.waiting = []; }
    else z.seatOf.clear();
  }
  E.DATA = null; renderBoard(); renderStats();
}
