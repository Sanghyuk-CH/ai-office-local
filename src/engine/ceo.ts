/* ── 대표 (나) ──
   평소엔 대표실 책상에서 일하다가, 가끔(1분 반~2분 반에 한 번, 질문이 없을 때) 일어나
   위층부터 프로젝트 층을 차례로 내려가며 팀 섬 앞에 잠깐씩 들르고 대표실로 돌아온다.
   질문이 올라오면 돌던 중이라도 바로 자리로 돌아간다. 자료가 멈추면 같이 멈춘다 */
import { CEO_ID, CEO_SEAT } from './constants';
import type { Actor, CeoActKey, Dest, Floor, Pose, Pt } from './model';
import { setDest } from './people';
import { ceoSheet } from './sprites';
import { E } from './state';

const CEO_TALK = ['다들 수고 많아요!', '잘 되어 가나요?', '무리하지 말아요', '오늘도 화이팅!', '필요한 거 있으면 말해요'];
export const allPeople = (): Actor[] => E.ceoA ? [...E.actors.values(), E.ceoA] : [...E.actors.values()];
const ceoFloor = (): Floor => E.FLOORS.get(CEO_ID)!;
export const ceoDeskDest = (): Dest => ({ type:'ceodesk', key:'ceodesk', pt:[CEO_SEAT[0], CEO_SEAT[1]], floor:ceoFloor() });
export function makeCeo(atDesk: boolean): Actor {
  const dest = ceoDeskDest();
  return { id:'#ceo', isCeo:true, floor: atDesk ? dest.floor as Floor : null, x:CEO_SEAT[0], y:CEO_SEAT[1], path:[], dest, atKey: atDesk ? dest.key : null,
    alpha:1, wait:0, walkT:0, walking:false, flip:false, dead:false, want:null, phase:0.3, sheet:ceoSheet(), pose:{ f:4 },
    sx:0, sy:0, bx:0, by:0, frame:4, bubble:null, ride:null, tour:null, linger:0, greeted:false, nextTour: E.clock + 50 + Math.random()*40,
    slot:0, rx:0, ry:0, rwalk:false, yieldT:0, replanT:0, dark:0 };
}
export function ceoPose(a: Actor): Pose {
  const clock = E.clock, DATA = E.DATA;
  const here = a.floor === a.dest.floor && !a.path.length;
  if (a.dest.type === 'ceodesk' && here) {
    if (a.act && a.act.type === 'stretch') return { f:[6,7][Math.floor(clock*2.2) % 2] };
    return { f:[4,5][Math.floor(clock*(DATA && DATA.pq.size ? 2.5 : 5)) % 2] };
  }
  if (a.dest.type === 'ceospot' && here) return { f:10, fx: a.dest.act === 'water' ? 'water' : a.dest.act === 'window' ? 'steam2' : null };
  return { f:10 };
}
/* 대표실 안에서 하는 일: 창가에서 커피, 책장 앞에서 책 구경, 자리에서 기지개, 화분 물 주기 */
const CEO_ACTS: Record<CeoActKey, { pt?: Pt; talk: string; stay: number }> = {
  window: { pt:[3.5, 0.62], talk:'날씨 좋네요', stay:4.5 },
  books:  { pt:[0.95, 1.4], talk:'어디 보자…', stay:4.0 },
  water:  { pt:[4.25, 1.2], talk:'쑥쑥 자라라', stay:3.6 },
  stretch:{ talk:'으아~ 기지개', stay:2.6 },
};
function startAct(a: Actor): void {
  const clock = E.clock;
  const keys = (Object.keys(CEO_ACTS) as CeoActKey[]).filter(k => k !== a.lastAct), k = keys[Math.floor(Math.random()*keys.length)], act = CEO_ACTS[k];
  a.lastAct = k; a.nextIdle = clock + 22 + Math.random()*25;
  if (k === 'stretch') { a.act = { type:'stretch', until: clock + act.stay }; a.bubble = { text:act.talk, until: clock + act.stay }; return; }
  a.linger = act.stay; a.greeted = false;
  const pt = act.pt!;
  setDest(a, { type:'ceospot', key:'ceospot:' + k, act:k, pt:[pt[0], pt[1]], floor:ceoFloor() }, null);
}
export function startTour(a: Actor): void {
  const stops: Dest[] = [];
  for (const f of E.FL) {
    if (f.ceo) continue;
    const teams = f.zones.filter(z => z.kind === 'team').slice(0, 2);
    const spots = teams.length ? teams : (f.lounge ? [f.lounge] : []);
    spots.forEach((z, i) => stops.push({ type:'tour', key:`tour:${f.id}:${i}`, pt:[(z.x0 + z.x1)/2, Math.min(z.y1 + 0.5, f.ny - 0.4)], floor:f }));
  }
  if (!stops.length) { a.nextTour = E.clock + 60; return; }
  a.tour = stops; nextStop(a, '한 바퀴 둘러보고 올게요');
}
function nextStop(a: Actor, text?: string): void {
  const st = a.tour && a.tour.shift();
  if (!st) { a.tour = null; a.forced = false; a.nextTour = E.clock + 90 + Math.random()*60; setDest(a, ceoDeskDest(), '자리로 돌아갑니다'); return; }
  a.linger = 2.8; a.greeted = false;
  setDest(a, st, text || null);
}
export function ceoUpdate(dt: number): void {
  const a = E.ceoA; if (!a) return;
  const clock = E.clock, DATA = E.DATA;
  // 출퇴근하는 동안은 빈손, 대표실에 앉은 뒤로는 커피잔
  if (a.dest.type === 'door') a.commute = true;
  a.sheet = ceoSheet(!a.commute && !(a.dest.type === 'ceospot' && a.dest.act === 'water'));
  if (!DATA || DATA.dayEnded || a.dest.type === 'door') return;
  const here = !a.ride && !a.path.length && a.floor === a.dest.floor;
  if (a.dest.type === 'ceodesk' && here) a.commute = false;
  if (a.act && clock >= a.act.until) a.act = null;
  if (a.dest.type === 'ceodesk') {
    if (here && !a.act && !DATA.pq.size) {
      if (clock >= (a.nextTour ?? 0) && E.FL.length > 1) startTour(a);
      else if (clock >= (a.nextIdle ?? (a.nextIdle = clock + 12 + Math.random()*10))) startAct(a);
    }
  } else if (a.dest.type === 'ceospot') {
    if (DATA.pq.size) { setDest(a, ceoDeskDest(), '질문이 왔네요'); return; }
    if (here) {
      if (!a.greeted) { a.greeted = true; a.bubble = { text: CEO_ACTS[a.dest.act].talk, until: clock + 2.4 }; }
      a.linger = (a.linger ?? 0) - dt; if (a.linger <= 0) setDest(a, ceoDeskDest(), null);
    }
  } else if (a.dest.type === 'tour') {
    if (DATA.pq.size && !a.forced) { a.tour = null; a.nextTour = clock + 90; setDest(a, ceoDeskDest(), '질문이 왔네요, 올라갑니다'); return; }
    if (here) {
      if (!a.greeted) { a.greeted = true; a.bubble = { text: CEO_TALK[Math.floor(Math.random()*CEO_TALK.length)], until: clock + 2.4 }; }
      a.linger = (a.linger ?? 0) - dt; if (a.linger <= 0) nextStop(a);
    }
  }
}
// 대표 순회: 바로 한 바퀴 돌게 한다(질문이 있어도 끝까지 돈다). 이미 도는 중이거나 퇴근 중이면 그대로
export function ceoTour(): void {
  const a = E.ceoA;
  if (!a || !E.DATA || E.DATA.dayEnded || a.dest.type === 'door' || a.dest.type === 'tour' || a.tour) return;
  a.forced = true; startTour(a);
  if (!a.tour && (a.dest as Dest).type !== 'tour') a.forced = false;   // startTour가 dest를 바꿨을 수 있다
}
