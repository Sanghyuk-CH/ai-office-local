/* 글자 (화면 해상도로 선명하게) */
import { F_BODY } from './constants';
import { E } from './state';
import { clamp } from './util';

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
export function bubble(x: number, y: number, text: string, warm: boolean): void {
  const ctx = E.ctx, cv = E.cv, U = E.view.u;
  ctx.font = `600 ${12*U}px ${F_BODY}`;
  const w = ctx.measureText(text).width + 16*U, h = 22*U;
  const bx = clamp(x - w/2, 4*U, cv.width - w - 4*U), by = Math.max(4*U, y - h - 6*U);
  const tx = clamp(x, bx + 9*U, bx + w - 9*U);
  ctx.fillStyle = warm ? '#fff4d6' : '#ffffff'; ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.5*U;
  ctx.beginPath(); ctx.moveTo(tx - 4*U, by + h - 1); ctx.lineTo(tx, by + h + 6*U); ctx.lineTo(tx + 4*U, by + h - 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  rr(ctx, bx, by, w, h, 7*U); ctx.fill(); ctx.stroke();
  ctx.fillRect(tx - 3*U, by + h - 2.5*U, 6*U, 3*U);
  ctx.fillStyle = '#2a2420'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 8*U, by + h/2 + 0.5*U);
}
export interface PillOpts { size?: number; alpha?: number; sel?: boolean; bg?: string }
export function pill(x: number, y: number, text: string, opts: PillOpts = {}): void {
  const ctx = E.ctx, cv = E.cv, U = E.view.u, fs = (opts.size || 10.5) * U;
  ctx.font = `600 ${fs}px ${F_BODY}`;
  const w = ctx.measureText(text).width + 12*U, h = fs + 7*U;
  const bx = clamp(x - w/2, 3*U, cv.width - w - 3*U), by = y - h/2;
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = opts.sel ? '#f0b445' : (opts.bg || 'rgba(26,30,28,.74)');
  rr(ctx, bx, by, w, h, h/2); ctx.fill();
  ctx.fillStyle = opts.sel ? '#2a2006' : '#f6f3ec'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 6*U, y + 0.5*U);
  ctx.globalAlpha = 1;
}
export interface PlaneTextOpts { font: string; size: number; color: string; max?: number; alpha?: number; exact?: boolean; align?: CanvasTextAlign }
export function planeText(mode: 'L' | 'R' | 'F', px: number, py: number, text: string, o: PlaneTextOpts): void {
  const ctx = E.ctx, view = E.view, K = view.kz;
  const m = mode === 'L' ? [1,-0.5,0,1] : mode === 'R' ? [1,0.5,0,1] : [1,0.5,-1,0.5];
  ctx.save(); ctx.setTransform(m[0]*K, m[1]*K, m[2]*K, m[3]*K, px*K + view.ox, py*K + view.oy);
  let size = o.size; ctx.font = `${size}px ${o.font}`;
  if (o.max) { const w = ctx.measureText(text).width; if (w > o.max) { size = size * o.max / w; ctx.font = `${size}px ${o.font}`; } }
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color;
  if (o.exact) {
    // 글자 모양(잇는 것만)의 한가운데를 기준점에 맞춘다. 판 위 글씨처럼 정확히 가운데여야 할 때
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const mt = ctx.measureText(text);
    ctx.fillText(text, (mt.actualBoundingBoxLeft - mt.actualBoundingBoxRight)/2, (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent)/2);
  } else { ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0); }
  ctx.restore();
}
