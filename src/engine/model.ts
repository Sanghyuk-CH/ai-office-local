// 엔진 안에서 쓰는 자료 구조 타입.
import type { Out } from './constants';
import type { SessionState, StatusQuestion } from './types';

export type Pt = [number, number];
/** 걸음 지점. 세 번째 값 1 = 정해진 방향으로 정확히 들어가는 걸음(비켜 가지 않음) */
export type PathPt = [number, number, number?];

/* ── 자료(정리한 상태 JSON) ── */
export interface Session {
  id: string;
  name: string;
  app?: string | null;
  project: string | null;
  group: string | null;
  parent: string | null;
  state?: SessionState | string;
  startedAt?: string;
  stateSince?: string;
  /** 정한 층(프로젝트 id) */
  proj: string;
  /** 정한 섬 id = proj + '/' + group */
  gid: string;
}
export type Question = StatusQuestion;

export interface Data {
  sessions: Session[];
  smap: Map<string, Session>;
  questions: Question[];
  pq: Map<string, Question>;        // 세션 id → 첫 질문
  qcount: Map<string, number>;
  groups: { id: string; name: string; project: string | null }[];
  projects: { id: string; name: string }[];
  dayEnded: boolean;
  subsOf: Map<string, string[]>;    // 상위 세션 id → 하위 작업자 id들
  apps: Set<string>;
}

export type Want =
  | { type: 'queue'; idx: number; q: Question; s: Session }
  | { type: 'desk'; s: Session };

/* ── 저장되는 그날의 건물 상태 ── */
export interface CapPlan { nx: number; ny: number; pos: Record<string, { x: number; y: number }> }
export interface Cap {
  source: string | null;
  day: string | null;
  floors: { id: string; name: string }[];
  zones: { id: string; name: string; floor: string }[];
  desks: Record<string, number>;
  sofa: Record<string, number>;
  huddles: Record<string, { gid: string; n: number }>;
  plans: Record<string, CapPlan>;
}

/* ── 건물 ── */
export interface Light { lit: number; mode: 'on' | 'off'; at: number }

interface ZoneBase {
  floor: Floor;
  key: string;
  name: string;
  color: string;
  x0: number; y0: number; x1: number; y1: number;
  light: Light;
}
export interface TeamZone extends ZoneBase {
  kind: 'team';
  gid: string;
  slots: Pt[];
  lanes: number[];
  slotOf: Map<string, number>;
  owners: (string | null)[];
  waiting: string[];
  overflow: number;
}
export interface LoungeSeat { x: number; y: number; fy: number; lane: number }
export interface LoungeItem { t: 'back' | 'seat' | 'table' | 'machine' | 'plant'; x: number; y: number; w?: number; k: number }
export interface LoungeZone extends ZoneBase {
  kind: 'lounge';
  seats: LoungeSeat[];
  seatOf: Map<string, number>;
  items: LoungeItem[];
  cap: number;
  rows: number;
}
export interface MeetSeat { dx: number; dy: number; x: number; y: number; lane: number }
export interface MeetZone extends ZoneBase {
  kind: 'meet';
  hk: string;
  gid: string;
  seats: MeetSeat[];
  seatOf: Map<string, number>;
  pid: string | null;
}
export type Zone = TeamZone | LoungeZone | MeetZone;

export type Wall =
  | { d: 'h'; y: number; a: number; b: number; l: Light }
  | { d: 'v'; x: number; a: number; b: number; l: Light };

export interface Nav { W: number; H: number; B: Uint8Array; Z: Int16Array }

export interface FloorLights { common: Light; ceo: Light | null }

export interface Floor {
  id: string;
  ceo: boolean;
  name: string;
  num: number;
  dy: number;
  nx: number;
  ny: number;
  zones: Zone[];
  decor: Pt[];
  lounge: LoungeZone | null;
  rooms: MeetZone[];
  nav: Nav | null;
  BGC: HTMLCanvasElement | null;
  DARKC: HTMLCanvasElement | null;
  darkKey: string;
  L: FloorLights;
  door: number;
  walls: Wall[];
  ceoDoorOpen: boolean;
}
export type FloorRef = Floor | Out;

/* ── 가려는 곳 ── */
export type CeoActKey = 'window' | 'books' | 'water' | 'stretch';
export type Dest =
  | { type: 'door'; key: 'door'; floor: Out }
  | { type: 'lift'; key: 'lift'; floor: Floor }
  | { type: 'queue'; key: string; pt: Pt; floor: Floor }
  | { type: 'meet'; key: string; seat: Pt; info: MeetSeat; zone: MeetZone; slot: number; floor: Floor }
  | { type: 'lounge'; key: string; seat: Pt; info: LoungeSeat; zone: LoungeZone; slot: number; floor: Floor }
  | { type: 'help'; key: string; pt: Pt; zone: TeamZone; floor: Floor }
  | { type: 'wait'; key: string; pt: Pt; zone: TeamZone; floor: Floor }
  | { type: 'desk'; key: string; seat: Pt; lane: number; zone: TeamZone; slot: number; floor: Floor }
  | { type: 'ceodesk'; key: 'ceodesk'; pt: Pt; floor: Floor }
  | { type: 'ceospot'; key: string; act: CeoActKey; pt: Pt; floor: Floor }
  | { type: 'tour'; key: string; pt: Pt; floor: Floor };
export type DestType = Dest['type'];

/* ── 사람 ── */
/** 캐릭터 시트(코드로 그린 캔버스 또는 불러온 그림) */
export type Sheet = HTMLCanvasElement | HTMLImageElement;
export interface Pose { f: number; fx?: string | null }
export interface Bubble { text: string; until: number }

export interface Ride {
  from: FloorRef;
  to: FloorRef;
  ph: 'board' | 'move' | 'arrive';
  t: number;
  c: number;
  c0: number;
  riders: Actor[];
  eta: number;
}

export interface Actor {
  id: string;
  floor: Floor | null;
  x: number; y: number;
  path: PathPt[];
  dest: Dest;
  atKey: string | null;
  alpha: number;
  wait: number;
  walkT: number;
  walking: boolean;
  flip: boolean;
  dead: boolean;
  want: Want | null;
  phase: number;
  sheet: Sheet;
  pose: Pose;
  sx: number; sy: number;
  bx: number; by: number;
  frame: number;
  bubble: Bubble | null;
  ride: Ride | null;
  // 엘리베이터 칸 안
  slot: number;
  rx: number; ry: number;
  rwalk: boolean;
  rideAl?: number;
  // 걷기
  yieldT: number;
  replanT: number;
  dark: number;
  // 대표만
  isCeo?: boolean;
  tour?: Dest[] | null;
  linger?: number;
  greeted?: boolean;
  nextTour?: number;
  commute?: boolean;
  act?: { type: 'stretch'; until: number } | null;
  lastAct?: CeoActKey;
  nextIdle?: number;
  forced?: boolean;
}

/* ── 화면 ── */
export interface View { k: number; u: number; css: number; labels: boolean; kz: number; ox: number; oy: number }
export interface Cam { zoom: number; cx: number | null; cy: number | null }
export interface CamTarget { zoom: number; cx: number; cy: number }
export interface CamAnim { from: { zoom: number; cx: number | null; cy: number | null }; to: CamTarget; t0: number; ms: number }
export interface Tween { a: number; bx: number; by: number; t0: number }
