/* 엔진 인스턴스 하나의 모든 바뀌는 상태.
   createOffice가 인스턴스마다 새 Ctx를 만들고, 엔진에 들어오는 모든 입구(프레임, 이벤트, API 호출, 비동기 재개)에서
   bind(ctx)로 "지금 다루는 인스턴스"를 가리킨 뒤 동기적으로 일한다. 그래서 인스턴스가 둘이어도 섞이지 않는다
   (원래 코드가 CF로 "지금 층"을 갈아 끼우던 것과 같은 방식). */
import type {
  Actor, Cam, CamAnim, Cap, Data, Floor, FloorLights, LoungeZone, MeetZone, Nav, Pt, Ride, Tween, View, Zone, TeamZone,
} from './model';
import type { Sim } from './sim';
import type { SourceMode, UiSnapshot } from './types';

export interface SprEntry { img: HTMLCanvasElement | null; x: number; y: number; w: number; h: number }

export interface Ctx {
  /* DOM */
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stage: HTMLElement;

  /* 건물 크기(층 안 좌표 → 화면) */
  NX: number; NY: number; W0: number; H0: number; OX: number; OY: number; FH0: number;
  STOREY: number;
  DOORY: number; DOOR: Pt;
  sprCache: Map<string, SprEntry>;
  SPRITE_IMG: HTMLImageElement | null;

  /* 자리 수 저장 상태 */
  cap: Cap;
  short: { desks: Record<string, number>; sofa: Record<string, number> };
  capResetPending: boolean;
  growNote: { text: string; until: number } | null;

  /* 건물 */
  FLOORS: Map<string, Floor>;
  FL: Floor[];
  /** 지금 그리거나 걷게 하는 층. 아래 zones..L은 이 층의 것을 가리킨다 */
  CF: Floor;
  zones: Zone[];
  decor: Pt[];
  lounge: LoungeZone | null;
  rooms: MeetZone[];
  nav: Nav | null;
  L: FloorLights;
  ALLZ: Zone[];
  layoutSig: boolean | null;
  layoutKey: string | null;
  BG: boolean;
  zoneByGid: Map<string, TeamZone>;
  roomByKey: Map<string, MeetZone>;
  emptySince: Map<string, number>;
  roomOf: Map<string, string>;
  meetOf: Map<string, { key: string; pid: string }>;

  /* 사람·자료 */
  actors: Map<string, Actor>;
  clock: number;
  DATA: Data | null;
  dataNow: number;
  hasData: boolean;
  lastFresh: number;
  lastKey: string | null;
  initialApply: boolean;
  lightsState: boolean | null;
  sel: string | null;
  frozen: boolean;
  queueOverflow: number;
  loungeOf: Map<string, number>;
  srcMode: SourceMode;
  ceoA: Actor | null;
  rides: Ride[];

  /* 화면 */
  view: View;
  tween: Tween | null;
  TWEEN_MS: number;
  cam: Cam;
  ZMAX: number;
  camAnim: CamAnim | null;
  ptrs: Map<number, { x: number; y: number }>;
  dragMoved: boolean;
  downAt: { x: number; y: number } | null;
  pinch: { d: number } | null;

  /* 프레임·화면 조각 */
  lastStatusAt: number;
  lastT: number;
  lastLampKey: string;
  liftKey: string | null;
  sim: Sim;
  ui: UiSnapshot;      // 고치는 중인 조각들
  snap: UiSnapshot;    // 마지막으로 내보낸 조각들(getSnapshot)
  dirty: boolean;
  listeners: Set<() => void>;
  isTauri: boolean;
}

/** 지금 다루는 인스턴스. 입구마다 bind로 맞춘다 */
export let E: Ctx = null as unknown as Ctx;
export function bind(c: Ctx): void { E = c; }

export const blankCap = (day: string | null, source: string | null = null): Cap =>
  ({ source, day, floors:[], zones:[], desks:{}, sofa:{}, huddles:{}, plans:{} });

export function initialUi(): UiSnapshot {
  return {
    status: { state:'checking', text:'확인 중', sub:'첫 자료를 기다리는 중', staleText:'첫 자료를 기다리는 중입니다', frozen:true },
    stats: [],
    board: { ready:false, floors:[], capNote:'' },
    lift: [],
    zoom: { pct:100, canIn:true, canOut:false, canFit:false },
    tip: null,
    selected: null,
    source: { mode:'sim', note:'', simCut:false, simClosing:false },
  };
}

export function createCtx(cv: HTMLCanvasElement, stage: HTMLElement, sim: Sim, isTauri: boolean): Ctx {
  const ui = initialUi();
  const placeholderFloor = null as unknown as Floor;   // useFloor 전에는 쓰지 않는다
  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduce = false; }
  return {
    cv, ctx: cv.getContext('2d') as CanvasRenderingContext2D, stage,
    NX:18, NY:10, W0:540, H0:348, OX:206, OY:70, FH0:300,
    STOREY:250,
    DOORY:8.9, DOOR:[0.12, 8.9],
    sprCache: new Map(),
    SPRITE_IMG: null,

    cap: blankCap(null),
    short: { desks:{}, sofa:{} },
    capResetPending: false,
    growNote: null,

    FLOORS: new Map(),
    FL: [],
    CF: placeholderFloor,
    zones: [], decor: [], lounge: null, rooms: [], nav: null,
    L: { common: { lit:1, mode:'on', at:-1e9 }, ceo: null },
    ALLZ: [], layoutSig: null, layoutKey: null, BG: false,
    zoneByGid: new Map(), roomByKey: new Map(),
    emptySince: new Map(), roomOf: new Map(), meetOf: new Map(),

    actors: new Map(),
    clock: 0,
    DATA: null,
    dataNow: Date.now(),
    hasData: false, lastFresh: -1e9, lastKey: null, initialApply: true,
    lightsState: null, sel: null, frozen: true,
    queueOverflow: 0, loungeOf: new Map(),
    srcMode: 'sim',
    ceoA: null,
    rides: [],

    view: { k:2, u:1, css:540, labels:true, kz:2, ox:0, oy:0 },
    tween: null,
    TWEEN_MS: reduce ? 1 : 600,
    cam: { zoom:1, cx:null, cy:null },
    ZMAX: 4,
    camAnim: null,
    ptrs: new Map(),
    dragMoved: false, downAt: null, pinch: null,

    lastStatusAt: 0,
    lastT: performance.now(),
    lastLampKey: '',
    liftKey: null,
    sim,
    ui, snap: ui, dirty: false,
    listeners: new Set(),
    isTauri,
  };
}
