/* ── 확대·이동 ──
   100% = 건물 전체가 화면에 들어오는 크기. cam.cx·cy는 화면 가운데에 오는 건물 좌표. 화면 밖으로 빠져나가지 않게 가둔다 */
import { HW, SHW, WALL } from './constants';
import type { CamTarget, Floor } from './model';
import { E } from './state';
import { hideTip, setSlice } from './ui';
import { clamp } from './util';

export const ZMIN = 1;
const fitScale = () => Math.min(E.cv.width / E.W0, E.cv.height / E.H0);
export function camApply(): void {
  const cam = E.cam, cv = E.cv, view = E.view;
  const camAnim = E.camAnim;
  if (camAnim) {
    const e = Math.min(1, (performance.now() - camAnim.t0) / camAnim.ms), s = e*e*(3 - 2*e), A = camAnim.from, B = camAnim.to;
    cam.zoom = Math.exp(Math.log(A.zoom) + (Math.log(B.zoom) - Math.log(A.zoom))*s);
    // (from의 cx·cy는 camApply를 거친 뒤라 늘 숫자다)
    cam.cx = (A.cx ?? 0) + (B.cx - (A.cx ?? 0))*s; cam.cy = (A.cy ?? 0) + (B.cy - (A.cy ?? 0))*s;
    if (e >= 1) E.camAnim = null;
    syncZoomUi();
  }
  const fs = fitScale();
  E.ZMAX = Math.max(2, 6*view.u / fs);
  cam.zoom = clamp(cam.zoom, ZMIN, E.ZMAX);
  const kz = fs * cam.zoom, hw = cv.width / (2*kz), hh = cv.height / (2*kz);
  if (cam.cx == null) { cam.cx = E.W0/2; cam.cy = E.H0/2; }
  cam.cx = E.W0 <= 2*hw ? E.W0/2 : clamp(cam.cx, hw, E.W0 - hw);
  cam.cy = E.H0 <= 2*hh ? E.H0/2 : clamp(cam.cy ?? 0, hh, E.H0 - hh);
  view.kz = kz; view.ox = cv.width/2 - cam.cx*kz; view.oy = cv.height/2 - cam.cy*kz;
}
export function camGo(to: CamTarget): void { camApply(); E.camAnim = { from:{ zoom:E.cam.zoom, cx:E.cam.cx, cy:E.cam.cy }, to, t0:performance.now(), ms: E.TWEEN_MS }; }
function floorBox(f: Floor) { return { x0: E.OX - (E.NY + SHW)*HW - 6, x1: E.OX + f.nx*HW + 6, y0: f.dy + E.OY - WALL - 10, y1: f.dy + E.FH0 + 4 }; }
export function zoomFloor(f: Floor | undefined): void {
  if (!f) return;
  camApply();
  const cv = E.cv;
  const b = floorBox(f), fs = fitScale(), k = Math.min(cv.width / (b.x1 - b.x0), cv.height / (b.y1 - b.y0)) * 0.97;
  hideTip(); camGo({ zoom: clamp(k / fs, ZMIN, E.ZMAX), cx:(b.x0 + b.x1)/2, cy:(b.y0 + b.y1)/2 });
}
export function screenToBase(clientX: number, clientY: number): [number, number] {
  const cv = E.cv, view = E.view;
  const r = cv.getBoundingClientRect(), sx = (clientX - r.left) * cv.width / r.width, sy = (clientY - r.top) * cv.height / r.height;
  return [(sx - view.ox) / view.kz, (sy - view.oy) / view.kz];
}
export function syncZoomUi(): void {
  const z = E.cam.zoom, prev = E.ui.zoom;
  const next = { pct: Math.round(z * 100), canIn: !(z >= E.ZMAX - 1e-3), canOut: !(z <= ZMIN + 1e-3), canFit: !(z <= ZMIN + 1e-3) };
  if (next.pct !== prev.pct || next.canIn !== prev.canIn || next.canOut !== prev.canOut || next.canFit !== prev.canFit) setSlice('zoom', next);
  E.cv.style.touchAction = z > ZMIN + 1e-3 ? 'none' : 'pan-y';
}
export function zoomAt(clientX: number, clientY: number, factor: number): void {
  const cam = E.cam, cv = E.cv;
  E.camAnim = null; camApply();
  const [bx, by] = screenToBase(clientX, clientY);
  const r = cv.getBoundingClientRect(), sx = (clientX - r.left) * cv.width / r.width, sy = (clientY - r.top) * cv.height / r.height;
  cam.zoom = clamp(cam.zoom * factor, ZMIN, E.ZMAX);
  const kz = fitScale() * cam.zoom;
  cam.cx = bx - (sx - cv.width/2) / kz; cam.cy = by - (sy - cv.height/2) / kz;
  camApply(); syncZoomUi(); hideTip();
}
export function zoomCenter(factor: number): void { const r = E.cv.getBoundingClientRect(); zoomAt(r.left + r.width/2, r.top + r.height/2, factor); }
export function zoomFit(): void { camGo({ zoom:1, cx:E.W0/2, cy:E.H0/2 }); }
export function resize(): void {
  const cv = E.cv, view = E.view;
  const r = E.stage.getBoundingClientRect(), cssW = r.width || 600, cssH = r.height || 420, dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(cssW*dpr)), h = Math.max(1, Math.round(cssH*dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  view.css = cssW; view.u = w / cssW;
}
