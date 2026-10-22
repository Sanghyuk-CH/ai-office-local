/* ── 승강로 ──
   왼쪽 벽 바깥, 원래 출입문 자리에 붙어 맨 아래부터 꼭대기까지 이어진다(x -SHW~0, y DOORY±SHD/2).
   건물 뒤쪽이라 층 높이에서는 벽에 가려지고, 벽에 난 문이 열리면 그 안의 칸이 보인다. 층 사이에서는 유리 너머로 오르내리는 칸이 보인다.
   맨 위층 좌표로 그리고, 층 i의 바닥 높이는 z = -i·STOREY. 모든 층보다 먼저(뒤에) 그린다 */
import { F_DISPLAY, SHD, SHW, SLAB, WALL } from './constants';
import { drawSheet } from './draw';
import { box, dq, iso, planeX, planeY, poly, sprite, tileP, type G } from './iso';
import type { Actor } from './model';
import { E } from './state';
import { planeText } from './text';
import { clamp, dk } from './util';

const shaftDark = () => { let m = 0; for (const f of E.FL) m = Math.max(m, f.L.common.lit); return 1 - m; };
const STEEL = { top:'#6d7780', l:'#58626b', r:'#4a535b' };
const shaftBox = (n: number) => ({ x0:-SHW, x1:0, y0:E.DOORY - SHD/2, y1:E.DOORY + SHD/2, zb:-(n - 1)*E.STOREY - SLAB - 34, zt:WALL + 14 });
function drawShaftBack(c: G, n: number, d: number): void {
  const { x0, x1, y0, y1, zb, zt } = shaftBox(n);
  box(c, x0 - 0.25, y0 - 0.1, x1 - x0 + 0.25, SHD + 0.35, zb - 8, 8, { top:'#3a4046', l:'#2c3136', r:'#25292d' }, d);   // 바닥 기초
  planeX(c, x0, y0, y1, zb, zt, `rgba(120,150,170,${0.34 - 0.14*d})`);   // 왼쪽 안벽 (푸른 유리)
  planeY(c, x0, x1, y0, zb, zt, `rgba(96,122,142,${0.42 - 0.16*d})`);    // 안쪽 벽
  planeY(c, x0 + 0.35, x0 + 0.42, y0, zb, zt, dk('#55616c', d)); planeY(c, x1 - 0.42, x1 - 0.35, y0, zb, zt, dk('#55616c', d));   // 레일
}
function drawShaftFront(c: G, n: number, d: number): void {
  const { x0, x1, y0, y1, zb, zt } = shaftBox(n);
  planeY(c, x0, x1, y1, zb, zt, `rgba(185,225,242,${0.2 - 0.1*d})`);
  planeX(c, x1, y0, y1, zb, zt, `rgba(185,225,242,${0.12 - 0.06*d})`);
  planeY(c, x0 + 0.22, x0 + 0.38, y1, zb, zt, `rgba(255,255,255,${0.16 - 0.1*d})`);   // 유리 반사
  for (let i = 0; i < n; i++) {
    const z = -i*E.STOREY;
    planeY(c, x0, x1, y1, z - SLAB, z, dk('#58626b', d)); planeX(c, x1, y0, y1, z - SLAB, z, dk('#4a535b', d));
    planeY(c, x0 + 0.4, x1 - 0.4, y1, z + 47, z + 57, dk('#1f262c', d));                 // 층 번호 판
  }
  planeY(c, x0, x0 + 0.1, y1, zb, zt, dk('#58626b', d));
  planeY(c, x1 - 0.1, x1, y1, zb, zt, dk('#58626b', d)); planeX(c, x1, y1 - 0.1, y1, zb, zt, dk('#4a535b', d));
  planeX(c, x1, y0, y0 + 0.1, zb, zt, dk('#4a535b', d));
  box(c, x0 - 0.06, y0 - 0.06, x1 - x0 + 0.06, SHD + 0.12, zt, 6, STEEL, d);
}
function drawCab(g: CanvasRenderingContext2D, z: number, al: number, d: number, riders: Actor[]): void {
  const { y0, y1 } = shaftBox(E.FL.length), cx0 = -SHW + 0.14, cx1 = -0.08, cy0 = y0 + 0.12, cy1 = y1 - 0.12, h = 42;
  g.save(); g.globalAlpha = al;
  planeX(g, cx0, cy0, cy1, z - 3, z, dk('#4c5258', d)); planeY(g, cx0, cx1, cy1, z - 3, z, dk('#3f454a', d));
  poly(g, tileP(cx0, cy0, cx1, cy1, z), dk('#c7b089', d));
  planeY(g, cx0, cx1, cy0, z, z + h, dk('#efe3c6', d));
  planeX(g, cx0, cy0, cy1, z, z + h, dk('#e2d3b4', d)); planeX(g, cx0, cy0, cy1, z + h - 3, z + h, dk('#fff3c9', d));
  planeY(g, cx0 + 0.3, cx1 - 0.3, cy0, z + 14, z + 15, dk('#b9a37a', d));   // 손잡이
  g.restore();
  for (const a of riders.sort((p, q) => (p.rx + p.ry) - (q.rx + q.ry))) drawRider(g, a, z, al, d);
  g.save(); g.globalAlpha = al;
  planeY(g, cx0, cx0 + 0.07, cy1, z, z + h, dk('#8b939a', d)); planeY(g, cx1 - 0.07, cx1, cy1, z, z + h, dk('#8b939a', d));
  planeY(g, cx0, cx1, cy1, z + h - 3, z + h, dk('#8b939a', d)); planeX(g, cx1, cy0, cy1, z + h - 3, z + h, dk('#757d84', d));
  planeY(g, cx0, cx1, cy1, z, z + 3, dk('#8b939a', d)); planeX(g, cx1, cy0, cy1, z, z + 3, dk('#757d84', d));
  g.restore();
}
function drawRider(g: CanvasRenderingContext2D, a: Actor, z: number, al: number, d: number): void {
  const [sx, sy] = iso(a.rx, a.ry, z); a.sx = sx; a.sy = sy; a.bx = sx; a.by = sy + E.FL[0].dy;
  const f = a.rwalk ? Math.floor(a.walkT*8) % 4 : 10; a.frame = f; a.dark = d;
  drawSheet(g, a, Math.round(sx), Math.round(sy), f, d, al, false);
}
export function drawShaft(g: CanvasRenderingContext2D): void {
  const n = E.FL.length, d = shaftDark(), dl = dq(d);
  sprite(g, `shB:${n}:${E.DOORY}:${E.STOREY}:${dl}`, c => drawShaftBack(c, n, dl/20));
  for (const r of E.rides.slice().sort((p, q) => p.c - q.c)) {
    const al = clamp(1 - (r.c - (n - 1)) / 0.4, 0, 1);
    for (const a of r.riders) a.rideAl = al;   // 땅 아래(안 보임)에 있는 칸의 사람은 말풍선·설명도 숨긴다
    if (al > 0.01) drawCab(g, -r.c*E.STOREY, al, d, r.riders.slice());
  }
  sprite(g, `shF:${n}:${E.DOORY}:${E.STOREY}:${dl}`, c => drawShaftFront(c, n, dl/20));
}
export function drawShaftLabels(): void {
  const d = shaftDark(), { y1 } = shaftBox(E.FL.length);
  E.FL.forEach((f, i) => { const [px, py] = iso(-SHW/2, y1, -i*E.STOREY + 52); planeText('R', px, py, `${f.num}F`, { font:F_DISPLAY, size:7, color: d > 0.5 ? '#8a7440' : '#f0b445' }); });
}
/* 벽에 난 엘리베이터 문 (층마다 열림 정도). 문 자리는 배경 그림에서 뚫어 두었다 */
export function drawLandingDoor(c: G, o: number, d: number): void {
  const a = E.DOORY - 0.62, b = E.DOORY + 0.62, w = ((b - a)/2) * (1 - o);
  if (w > 0.02) {
    planeX(c, 0, a, a + w, 0, 30, dk('#a6afb8', d)); planeX(c, 0, b - w, b, 0, 30, dk('#9aa3ac', d));
    if (w > 0.1) { planeX(c, 0, a + w - 0.05, a + w, 0, 30, dk('#7f8891', d)); planeX(c, 0, b - w, b - w + 0.05, 0, 30, dk('#c2c9d0', d)); }
  }
}
