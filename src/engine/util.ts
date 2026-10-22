import { NIGHT, NIGHT_A } from './constants';

export const mk = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
/** 2D 문맥. 캔버스 2D는 늘 지원된다고 본다 */
export const ctx2d = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext('2d') as CanvasRenderingContext2D;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const hexRgb = (h: string): number[] => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)); };
export const rgbHex = (r: number, g: number, b: number): string => '#' + [r,g,b].map(v => clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
export const mix = (a: string, b: string, t: number): string => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t, A[2]+(B[2]-A[2])*t); };
export const shade = (c: string, t: number): string => t < 0 ? mix(c,'#000000',-t) : mix(c,'#ffffff',t);
const dkCache = new Map<string, string>();
export const dk = (c: string, d: number): string => { if (d <= 0.01) return c; const k = c + Math.round(d*20); let v = dkCache.get(k); if (!v) { v = mix(c, NIGHT, NIGHT_A * Math.round(d*20) / 20); dkCache.set(k, v); } return v; };
export const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const trunc = (s: unknown, n: number): string => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n-1) + '…' : t; };
export const tms = (v: unknown): number | null => { const t = Date.parse(v as string); return isNaN(t) ? null : t; };
export const fmtMin = (m: number): string => { m = Math.max(0, Math.floor(m)); if (m < 60) return m + '분'; const h = Math.floor(m/60); return h + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : ''); };
export const fmtClock = (ms: number): string => new Date(ms).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', hour12:false });
export const dayId = (ms: number): string => { const d = new Date(ms), p = (n: number) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
