/* ── 화면 조각 만들기 ──
   글로 보여 줄 것은 DOM에 직접 쓰지 않고 UiSnapshot 조각으로 만든다. 조각은 바뀔 때만 새 객체로 갈아 끼우고,
   알림은 프레임마다 한 번(flush)으로 모은다. */
import { floorName } from './building';
import { capStore, sofaCap } from './capStore';
import { APP_LABEL, MAX_FLOORS, OUT, TAURI_EVENT } from './constants';
import type { Actor, Floor, Session } from './model';
import { isSweaty, minsSince, stateInfo } from './people';
import { E } from './state';
import type {
  FloorSection, LiftButton, Member, QueueItem, SourceSlice, StatItem, StatusSlice, TipLine, Tone, UiSnapshot, ZoneCard,
} from './types';
import { fmtClock, fmtMin, trunc } from './util';

export function setSlice<K extends keyof UiSnapshot>(k: K, v: UiSnapshot[K]): void {
  if (E.ui[k] === v) return;
  E.ui = { ...E.ui, [k]: v };
  E.dirty = true;
}
/** 바뀐 조각이 있으면 내보내고 알린다(프레임마다 한 번) */
export function flush(): void {
  if (!E.dirty) return;
  E.dirty = false;
  E.snap = E.ui;
  for (const l of [...E.listeners]) l();
}

/* ── 현황 숫자 ── */
export function renderStats(): void {
  const DATA = E.DATA;
  if (!DATA) { if (E.ui.stats.length) setSlice('stats', []); return; }
  const ss = DATA.sessions, free = ss.filter(s => !DATA.pq.has(s.id));
  const n = (f: (s: Session) => boolean) => free.filter(f).length;
  const items: StatItem[] = [
    { label:'전체', value:ss.length, colorVar:null },
    { label:'작업 중', value:n(s => !['blocked','reporting','idle'].includes(s.state as string)), colorVar:'--work' },
    { label:'땀', value:n(isSweaty), colorVar:'--warn' },
    { label:'결과 보고', value:n(s => s.state === 'reporting'), colorVar:'--ok' },
    { label:'대기', value:n(s => s.state === 'idle'), colorVar:'--idle' },
    { label:'나에게 질문', value:DATA.pq.size, colorVar:'--q' },
  ];
  if (JSON.stringify(items) !== JSON.stringify(E.ui.stats)) setSlice('stats', items);
  E.cv.setAttribute('aria-label', `사무실 전체 화면. ${items.map(it => `${it.label} ${it.value}`).join(', ')}. 자세한 내용은 아래 명단에 있습니다.`);
}

/* ── 층별 명단 ── */
export const appName = (a: string): string => APP_LABEL[a] || String(a);
// 도구 이름표: 도구가 두 가지 이상 섞여 있을 때만 붙인다(한 가지뿐이면 군더더기)
const appTag = (s: Session | null | undefined): Member['app'] => s && s.app && E.DATA && E.DATA.apps.size > 1
  ? { key: String(s.app).replace(/[^\w-]/g, ''), label: appName(s.app) } : null;
function memberOf(s: Session, where?: string): Member {
  const DATA = E.DATA!;
  const q = DATA.pq.get(s.id), info = stateInfo(s, q);
  const parent = s.parent ? DATA.smap.get(s.parent) : null;
  const kids = DATA.sessions.filter(x => x.parent === s.id).length;
  const bits: string[] = [];
  if (where) bits.push(where);
  if (s.parent) bits.push(`하위 작업자 · ${parent ? parent.name : s.parent}`);
  else if (kids) bits.push(`하위 작업자 ${kids}명`);
  const m = E.meetOf.get(s.id); if (m && s.id === m.pid) bits.push('회의 자리에서 팀과 작업'); else if (m) bits.push('회의 자리');
  if (q) bits.push(trunc(q.text, 30));
  const z = E.zoneByGid.get(s.gid);
  if (z && z.waiting.includes(s.id)) bits.push('자리 대기 중');
  const a = E.actors.get(s.id); if (a && a.ride) bits.push('엘리베이터 안');
  return { id:s.id, name:s.name, app:appTag(s), sub:bits, child: !!s.parent && !where, tone:info.cls, label:info.label, time:info.time };
}
const sectionOf = (f: Floor, meta: string, cards: ZoneCard[]): FloorSection =>
  ({ id:f.id, num:f.num, title: f.ceo ? '대표실' : f.name, floorName: floorName(f), meta, ceo:f.ceo, cards });
export function renderBoard(): void {
  const DATA = E.DATA, cap = E.cap;
  const deskTotal = E.ALLZ.reduce((n, z) => n + (z.kind === 'team' ? z.slots.length : 0), 0);
  const sofaTotal = cap.floors.slice(0, MAX_FLOORS).reduce((n, p) => n + sofaCap(p.id), 0);
  const capNote = `${E.FL.length}층(프로젝트 ${E.FL.length - 1}개 + 대표실), 책상 ${deskTotal}개, 소파 ${sofaTotal}자리. 자리는 1분 넘게 모자라면 늘어나고, 하루 마감 때 층과 자리가 모두 처음으로 돌아갑니다. 저장 위치: ${capStore.kind}.`;
  if (!DATA) { setSlice('board', { ready:false, floors:[], capNote: E.ui.board.capNote }); return; }
  const secs: FloorSection[] = [];
  for (const f of E.FL) {
    const cards: ZoneCard[] = [];
    if (f.ceo) {
      const queue: QueueItem[] = [...DATA.pq.values()].map((q, i) => {
        const s = DATA.smap.get(q.sessionId), m = minsSince(q.askedAt), more = (DATA.qcount.get(q.sessionId) || 1) - 1;
        const tone: Tone = m >= 8 ? 'bad' : m >= 3 ? 'warn' : 'q', sf = s && E.FLOORS.get(s.proj);
        return { sessionId:q.sessionId, order:i + 1, name: s ? s.name : (q.from || '알 수 없는 세션'), app:appTag(s), fromFloor: sf ? floorName(sf) : null,
          text:q.text, more, tone, time:fmtMin(m) };
      });
      cards.push({ key:'queue', kind:'queue', name:'대표실 앞 줄', color:'var(--q)', meta: DATA.pq.size ? `질문 ${DATA.pq.size}건` : '없음', dark:false,
        members:[], queue, empty:'기다리는 질문이 없습니다.' });
      secs.push(sectionOf(f, f.L.ceo!.lit < 0.5 ? '불 꺼짐' : '맨 위층', cards));
      continue;
    }
    let teams = 0;
    for (const z of f.zones) {
      if (z.kind !== 'team') continue;
      teams++;
      const tops = DATA.sessions.filter(s => s.gid === z.gid && !s.parent);
      const list = tops.flatMap(t => [t, ...DATA.sessions.filter(x => x.parent === t.id)]).concat(DATA.sessions.filter(s => s.gid === z.gid && s.parent && !DATA.smap.has(s.parent)));
      const sw = list.filter(s => !DATA.pq.has(s.id) && isSweaty(s)).length;
      const meta = `${list.length}명 · 책상 ${z.slots.length}${z.waiting.length ? ` · 자리 대기 ${z.waiting.length}` : ''}${sw ? ` · 땀 ${sw}` : ''}${z.light.lit < 0.5 ? ' · 불 꺼짐' : ''}`;
      cards.push({ key:z.key, kind:'team', name:z.name, color:z.color, meta, dark: z.light.lit < 0.5, members: list.map(s => memberOf(s)), queue:[], empty:'지금 아무도 없습니다.' });
    }
    if (f.lounge) {
      const lz = f.lounge, resting = [...lz.seatOf.keys()].map(id => DATA.smap.get(id)).filter((s): s is Session => !!s);
      cards.push({ key:lz.key, kind:'lounge', name:'휴게실', color:lz.color, meta:`소파 ${resting.length}/${lz.seats.length}`, dark: lz.light.lit < 0.5,
        members: resting.map(s => memberOf(s, E.zoneByGid.get(s.gid)?.name || '')), queue:[], empty:'쉬는 세션이 없습니다.' });
    }
    const n = DATA.sessions.filter(s => s.proj === f.id).length;
    secs.push(sectionOf(f, `${n}명 · 팀 ${teams}${f.L.common.lit < 0.5 ? ' · 불 꺼짐' : ''}`, cards));
  }
  const loose = DATA.sessions.filter(s => !E.zoneByGid.has(s.gid));
  if (loose.length) secs.push({ id:null, num:null, title:'자리 없는 세션', floorName:'', meta:'층이나 섬이 최대치를 넘어 화면에 놓지 못했습니다', ceo:false,
    cards:[{ key:'loose', kind:'loose', name:'', color:'var(--idle)', meta:'', dark:false, members: loose.map(s => memberOf(s)), queue:[], empty:'' }] });
  setSlice('board', { ready:true, floors:secs, capNote });
}
export function select(id: string | null): void {
  E.sel = E.sel === id ? null : id;
  setSlice('selected', E.sel);
  renderBoard();
}
export function syncLamps(): void {
  const k = E.FL.map(f => (f.L.common.lit < 0.5 ? 1 : 0) + f.zones.map(z => z.light.lit < 0.5 ? 1 : 0).join('')).join('|');
  if (k !== E.lastLampKey) { E.lastLampKey = k; if (E.DATA) renderBoard(); }
}
/* 층 바로가기 (엘리베이터 버튼판) */
export function renderLift(): void {
  const k = E.FL.map(f => f.id + ':' + f.num + ':' + f.name).join('|'); if (E.liftKey === k) return; E.liftKey = k;
  const btns: LiftButton[] = E.FL.map(f => ({ id:f.id, num:f.num, label:trunc(f.ceo ? '대표실' : f.name, 9), title:floorName(f) }));
  setSlice('lift', btns);
}

/* ── 마우스를 올리면 설명 ── */
export function hideTip(): void { if (E.ui.tip) setSlice('tip', null); }
export function showTip(a: Actor, x: number, y: number): void {
  const t = tipOf(a);
  setSlice('tip', t ? { x, y, title:t.title, lines:t.lines } : null);
}
function tipOf(a: Actor): { title: string; lines: TipLine[] } | null {
  const muted = (text: string): TipLine => ({ text, muted:true });
  if (a.isCeo) {
    const d = a.dest;
    const what = a.ride ? '엘리베이터 타는 중' : d.type === 'tour' ? '층을 둘러보는 중' : d.type === 'door' ? '퇴근하는 중'
      : d.type === 'ceospot' ? ({ window:'창가에서 커피 한잔', books:'책장 구경', water:'화분에 물 주는 중' } as Record<string, string>)[d.act]
      : a.act ? '기지개 켜는 중' : a.path.length ? '자리로 돌아가는 중' : '대표실에서 일하는 중';
    return { title:'대표 (나)', lines:[muted(String(what))] };
  }
  const w = a.want, DATA = E.DATA; if (!w || !DATA) return null;
  const s = w.s, q = DATA.pq.get(a.id), z = s && E.zoneByGid.get(s.gid), f = s && E.FLOORS.get(s.proj);
  const info = s ? stateInfo(s, q) : { label:'', time:'' };
  const lines: TipLine[] = [muted(`${s && s.app ? appName(s.app) + ' · ' : ''}${f ? floorName(f) + ' · ' : ''}${z ? z.name + ' · ' : ''}${info.label} ${info.time}`)];
  if (s && s.parent) { const p = DATA.smap.get(s.parent); lines.push(muted(`하위 작업자 · 상위: ${p ? p.name : s.parent}`)); }
  if (q) lines.push({ text:`“${q.text}”`, muted:false });
  if (a.ride) lines.push(muted(`엘리베이터로 ${a.ride.to === OUT ? '내려가는' : floorName(a.ride.to) + '에 가는'} 중`));
  else if (a.dest.type === 'wait') lines.push(muted('자리가 없어 서서 기다리는 중'));
  else if (a.dest.type === 'door') lines.push(muted('퇴근하는 중'));
  return { title: s ? s.name : a.id, lines };
}

/* ── 상태 표시 ── */
export function updateStatus(now: number): void {
  if (now - E.lastStatusAt < 250) return; E.lastStatusAt = now;
  const age = Math.floor((now - E.lastFresh) / 1000), prev = E.ui.status;
  let next: StatusSlice;
  if (!E.hasData) next = { state:'checking', text:'확인 중', sub:'첫 자료를 기다리는 중', staleText:'첫 자료를 기다리는 중입니다', frozen:E.frozen };
  else if (E.frozen) next = { state:'checking', text:'확인 중', sub:`${age}초째 갱신 없음`, staleText:`자료가 ${age}초째 갱신되지 않아 움직임을 멈췄습니다`, frozen:E.frozen };
  else next = { state:'live', text:'실시간', sub:`${fmtClock(E.dataNow)} 자료`, staleText:prev.staleText, frozen:E.frozen };
  if (next.state !== prev.state || next.text !== prev.text || next.sub !== prev.sub || next.staleText !== prev.staleText || next.frozen !== prev.frozen) setSlice('status', next);
  E.stage.classList.toggle('frozen', E.frozen);
}

/* ── 자료 연결 안내 ── */
const NOTE_SIM = '예시 데이터입니다. 실제 세션이 아닙니다. 1초마다 1분이 흘러서 40분 기준, 자리 늘어남, 줄이 길어지는 모습을 빨리 볼 수 있습니다. "새 프로젝트 시작"을 누르면 대표실 바로 아래에 층이 하나 생기고, "질문 추가"를 누르면 그 세션이 엘리베이터를 타고 맨 위층으로 올라갑니다.';
const NOTE_PUSH_TAURI = '앱이 Claude Code·Codex·Gemini 훅 기록을 읽어 1초마다 보내 줍니다. 훅 넣기·빼기, 기록 지우기는 메뉴바 아이콘의 메뉴에 있습니다.';
const NOTE_PUSH_WEB = `바깥에서 보내 주는 상태를 받습니다. Tauri에서는 백엔드가 "${TAURI_EVENT}" 이벤트로 상태 JSON을 emit 하면 되고, 그 밖에서는 office.push(상태)를 부르면 됩니다. 1초마다 보내지 않으면 5초 뒤 "확인 중"이 됩니다.`;
export function syncDemo(): void {
  const on = E.srcMode === 'sim', prev = E.ui.source;
  const next: SourceSlice = { mode:E.srcMode, note: on ? NOTE_SIM : E.isTauri ? NOTE_PUSH_TAURI : NOTE_PUSH_WEB, simCut: on && E.sim.cut, simClosing: on && E.sim.closing };
  if (next.mode !== prev.mode || next.note !== prev.note || next.simCut !== prev.simCut || next.simClosing !== prev.simClosing) setSlice('source', next);
}
