/* ── 등각 좌표와 픽셀 도형 ── */
import { HH, HW, PXA } from './constants';
import type { Pt } from './model';
import { E } from './state';
import { clamp, ctx2d, dk, mk } from './util';

/** 크기만 재는 가짜 그리기 판(sprite가 그림 크기를 알아낼 때) */
export interface Recorder {
  readonly __rec: true;
  fillStyle: string;
  ext(x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}
/** 도트 그리기 판: 진짜 캔버스 문맥 또는 Recorder */
export type G = CanvasRenderingContext2D | Recorder;
const isRec = (g: G): g is Recorder => '__rec' in g;

export interface BoxColors { top: string; l: string; r: string }

export const iso = (x: number, y: number, z = 0): Pt => [E.OX + (x-y)*HW, E.OY + (x+y)*HH - z];
/* 사무실 도트: 캐릭터 도트(1칸 = 사무실 1px)보다 2배 고운 격자(PXA)로 그린다.
   poly는 현재 변환을 읽어 실제 화면(또는 캐시) 픽셀 단위로 한 줄씩 칠해서 계단 모양 가장자리를 만든다.
   바닥·벽은 한 장, 가구는 하나씩 작은 그림으로 미리 그려 두고(sprite) 앞뒤 순서대로 붙인다. */
export function poly(g: G, pts: Pt[], col: string): void {
  if (isRec(g)) { for (const p of pts) g.ext(p[0], p[1]); return; }
  const m = g.getTransform();
  const P = pts.map(p => [m.a*p[0] + m.c*p[1] + m.e, m.b*p[0] + m.d*p[1] + m.f]);
  let a = Infinity, b = -Infinity;
  for (const p of P) { if (p[1] < a) a = p[1]; if (p[1] > b) b = p[1]; }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = col;
  for (let y = Math.round(a); y < Math.round(b); y++) {
    const yc = y + .5; let l = Infinity, r = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i+1) % P.length];
      if (p[1] === q[1]) continue;
      if (yc >= Math.min(p[1],q[1]) && yc < Math.max(p[1],q[1])) {
        const x = p[0] + (yc - p[1]) * (q[0]-p[0]) / (q[1]-p[1]);
        if (x < l) l = x; if (x > r) r = x;
      }
    }
    if (r > l) { const xl = Math.round(l), xr = Math.round(r); if (xr > xl) g.fillRect(xl, y, xr-xl, 1); }
  }
  g.restore();
}
export const dq = (d: number): number => Math.round(clamp(d, 0, 1) * 20);
export function sprite(g: CanvasRenderingContext2D, key: string, draw: (c: G) => void): void {
  let c = E.sprCache.get(key);
  if (!c) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const R: Recorder = { __rec:true, fillStyle:'', ext(x, y){ if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; },
      fillRect(x, y, w, h){ this.ext(x, y); this.ext(x + w, y + h); } };
    draw(R);
    if (!isFinite(x0)) { E.sprCache.set(key, { img:null, x:0, y:0, w:0, h:0 }); return; }
    const X0 = Math.floor(x0*PXA) - 1, Y0 = Math.floor(y0*PXA) - 1, W = Math.ceil(x1*PXA) + 1 - X0, H = Math.ceil(y1*PXA) + 1 - Y0;
    const img = mk(W, H), cg = ctx2d(img);
    cg.setTransform(PXA, 0, 0, PXA, -X0, -Y0);
    draw(cg);
    c = { img, x:X0/PXA, y:Y0/PXA, w:W/PXA, h:H/PXA };
    if (E.sprCache.size > 4000) E.sprCache.clear();
    E.sprCache.set(key, c);
  }
  if (c.img) g.drawImage(c.img, c.x, c.y, c.w, c.h);
}
export const tileP = (x0: number, y0: number, x1: number, y1: number, z = 0): Pt[] => [iso(x0,y0,z), iso(x1,y0,z), iso(x1,y1,z), iso(x0,y1,z)];
export const planeY = (g: G, x1: number, x2: number, y: number, z1: number, z2: number, c: string): void => poly(g, [iso(x1,y,z1), iso(x2,y,z1), iso(x2,y,z2), iso(x1,y,z2)], c);
export const planeX = (g: G, x: number, y1: number, y2: number, z1: number, z2: number, c: string): void => poly(g, [iso(x,y1,z1), iso(x,y2,z1), iso(x,y2,z2), iso(x,y1,z2)], c);
export function box(g: G, x: number, y: number, w: number, d: number, z: number, h: number, c: BoxColors, dd = 0): void {
  const z2 = z + h;
  poly(g, [iso(x,y+d,z), iso(x+w,y+d,z), iso(x+w,y+d,z2), iso(x,y+d,z2)], dk(c.l,dd));
  poly(g, [iso(x+w,y+d,z), iso(x+w,y,z), iso(x+w,y,z2), iso(x+w,y+d,z2)], dk(c.r,dd));
  poly(g, tileP(x,y,x+w,y+d,z2), dk(c.top,dd));
}
export function glyph(g: G, x: number, y: number, rows: string[], col: string): void { g.fillStyle = col; rows.forEach((r,j) => { for (let i = 0; i < r.length; i++) if (r[i] === '1') g.fillRect(x+i, y+j, 1, 1); }); }
export const QMARK = ['111','001','011','000','010'];
export const Z4 = ['1111','0010','0100','1111'];
export const Z5 = ['11111','00010','00100','01000','11111'];
