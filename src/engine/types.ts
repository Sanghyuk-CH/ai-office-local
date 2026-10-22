// 엔진(캔버스)과 React 화면 사이의 계약.
// 엔진은 캔버스·애니메이션·시뮬레이션을 맡고, 화면에 글로 보여 줄 것은 아래 UiSnapshot 조각으로 내보낸다.
// 조각은 바뀔 때만 새 객체로 갈아 끼운다(그대로면 같은 참조) — React가 조각별로 다시 그리게.

/* ── 상태 JSON (앱 백엔드 → 화면) ── */
export type SessionState = 'working' | 'blocked' | 'reporting' | 'idle';

export interface StatusSession {
  id: string;
  name: string;
  app?: string | null;
  project?: string | null;
  group?: string | null;
  parent?: string | null;
  state?: SessionState;
  startedAt?: string;
  stateSince?: string;
}

export interface StatusQuestion {
  id: string;
  sessionId: string;
  text: string;
  askedAt: string;
  from?: string;
}

export interface StatusJson {
  updatedAt?: string;
  seq?: number;
  dayEnded?: boolean;
  projects?: { id: string; name?: string }[];
  groups?: { id: string; name?: string; project?: string | null }[];
  sessions: StatusSession[];
  questions?: StatusQuestion[];
}

/* ── 화면 조각 ── */
/** 칩 색 이름. CSS 클래스 c-<tone> 과 같다 */
export type Tone = 'work' | 'warn' | 'bad' | 'ok' | 'idle' | 'q';

export interface StatusSlice {
  state: 'checking' | 'live';
  text: string;      // '확인 중' | '실시간'
  sub: string;       // '첫 자료를 기다리는 중', 'n초째 갱신 없음', 'HH:MM 자료'
  staleText: string; // 멈춤 안내 문구
  frozen: boolean;
}

export interface StatItem {
  label: string;
  value: number;
  /** CSS 변수 이름(예: '--work'). 없으면 null */
  colorVar: string | null;
}

export interface Member {
  id: string;
  name: string;
  /** 도구 이름표(도구가 두 가지 이상 섞였을 때만). 예: { key: 'codex', label: 'Codex' } */
  app: { key: string; label: string } | null;
  /** 이름 아래 작은 글씨 조각들. ' · '로 이어 붙인다 */
  sub: string[];
  child: boolean;    // 상위 세션 밑에 들여쓴 하위 작업자
  tone: Tone;
  label: string;     // 칩 글자
  time: string;      // '12분'
}

export interface QueueItem {
  sessionId: string;
  order: number;     // 1부터
  name: string;
  app: { key: string; label: string } | null;
  fromFloor: string | null; // '2F 웹 리뉴얼' 같은 층 이름(…에서 올라옴)
  text: string;
  more: number;      // 같은 세션의 질문이 더 있는 수
  tone: Tone;        // q | warn | bad
  time: string;
}

export interface ZoneCard {
  key: string;
  kind: 'team' | 'lounge' | 'queue' | 'loose';
  name: string;
  /** --zc 로 쓸 CSS 색 값(예: '#4f86c6' 또는 'var(--q)') */
  color: string;
  meta: string;
  dark: boolean;
  members: Member[];
  queue: QueueItem[]; // kind === 'queue'일 때만 채움
  empty: string;      // 비었을 때 문구
}

export interface FloorSection {
  /** 층 id. '자리 없는 세션' 묶음은 null (층 버튼 없음) */
  id: string | null;
  num: number | null;
  title: string;
  floorName: string; // 버튼 title용 전체 층 이름
  meta: string;
  ceo: boolean;
  cards: ZoneCard[];
}

export interface BoardSlice {
  ready: boolean;          // 첫 자료가 왔는지
  floors: FloorSection[];  // 화면 순서 그대로(위층부터)
  capNote: string;
}

export interface LiftButton {
  id: string;
  num: number;
  label: string; // 9자로 자른 이름
  title: string;
}

export interface ZoomSlice {
  pct: number;
  canIn: boolean;
  canOut: boolean;
  canFit: boolean;
}

export interface TipLine {
  text: string;
  muted: boolean;
}

export interface TipSlice {
  /** stage 안 좌표(px). 겹침 방지 보정은 화면 쪽에서 한다 */
  x: number;
  y: number;
  title: string;
  lines: TipLine[];
}

export type SourceMode = 'sim' | 'push';

export interface SourceSlice {
  mode: SourceMode;
  note: string;
  simCut: boolean;     // 예시: 자료 끊김
  simClosing: boolean; // 예시: 하루 마감 중
}

export interface UiSnapshot {
  status: StatusSlice;
  stats: StatItem[];
  board: BoardSlice;
  lift: LiftButton[];
  zoom: ZoomSlice;
  tip: TipSlice | null;
  selected: string | null;
  source: SourceSlice;
}

/* ── 엔진 API ── */
export interface Office {
  subscribe(listener: () => void): () => void;
  getSnapshot(): UiSnapshot;

  /** 상태 JSON 받기(push 모드일 때만 반영). 문자열이나 객체 */
  push(state: StatusJson | string): void;
  setSource(mode: SourceMode): void;

  select(id: string | null): void; // 같은 id면 선택 해제(토글)
  zoomIn(): void;
  zoomOut(): void;
  zoomFit(): void;
  zoomFloor(id: string): void;

  sim: {
    addSub(): void;
    addQuestion(): void;
    addGroupWork(): void;
    addProject(): void;
    toggleCut(): void;
    toggleDay(): void; // 하루 마감 ↔ 새 하루
  };
  ceoTour(): void;

  destroy(): void;
}
