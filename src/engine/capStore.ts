/* ── 자리 수 저장소 ──
   브라우저 저장소(localStorage)에 둔다. 저장 못 해도 화면은 그대로 동작한다. */
import { CAP_DEFAULT } from './constants';
import type { Cap } from './model';
import { E, blankCap } from './state';

const KEY = 'ai-office-capacity-v3';   // 배치 방식이 바뀌면 올린다(그날 저장된 옛 배치를 쓰지 않게)

export const capStore = {
  load(): unknown {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  },
  save(v: Cap): void {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 동작 */ }
  },
  clear(): void {
    try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  },
  kind: '이 기기',
};

/** 저장된 값을 읽어 그날의 건물 상태로 맞춘다. 모양이 틀리면 null */
export function parseSavedCap(saved: unknown): Cap | null {
  const obj = <T,>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, T>;
  if (!saved || typeof saved !== 'object') return null;
  const s = saved as Record<string, unknown>;
  if (!s.day || !Array.isArray(s.floors)) return null;
  type Raw = { id?: unknown; name?: unknown; floor?: unknown } | null;
  return {
    source: (s.source as string | null | undefined) ?? null, day: s.day as string,
    floors: (s.floors as Raw[]).filter(p => p && p.id != null).map(p => ({ id:String(p!.id), name:String(p!.name ?? p!.id) })),
    zones: Array.isArray(s.zones) ? (s.zones as Raw[]).filter(z => z && z.id != null && z.floor != null).map(z => ({ id:String(z!.id), name:String(z!.name ?? z!.id), floor:String(z!.floor) })) : [],
    desks: obj(s.desks), sofa: obj(s.sofa), huddles: obj(s.huddles), plans: obj(s.plans),
  };
}

/* 그날의 건물 상태(저장됨): 층(프로젝트) 순서, 팀 구역, 책상·소파 수, 회의 자리, 층마다 놓인 위치 */
export const deskCap = (gid: string): number => E.cap.desks[gid] ?? CAP_DEFAULT;
export const sofaCap = (fid: string): number => E.cap.sofa[fid] ?? CAP_DEFAULT;
export function resetCap(day: string): void { E.cap = blankCap(day, E.srcMode); E.roomOf.clear(); E.emptySince.clear(); E.short = { desks:{}, sofa:{} }; }
