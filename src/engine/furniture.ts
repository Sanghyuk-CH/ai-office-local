/* ── 가구 그림 (sprite 안에서 층 안 좌표로 그린다) ── */
import { drawPlant } from './background';
import { CEO } from './constants';
import { box, dq, glyph, iso, planeX, planeY, poly, QMARK, sprite, tileP, type G } from './iso';
import type { LoungeItem, LoungeZone } from './model';
import { dk, shade } from './util';

export function drawCeo(g: G, d: number): void {
  const { x1 } = CEO;
  box(g, 0.08, 0.5, 0.42, 1.7, 0, 30, { top:'#6b4a2e', l:'#7d5735', r:'#5f4127' }, d);
  for (let i = 0; i < 3; i++) planeX(g, 0.5, 0.6, 2.1, 6 + i*8, 11 + i*8, dk(['#c4493f','#4a7fc1','#d9b65a'][i], d));
  drawPlant(g, x1 - 0.55, 0.55, d);
  planeY(g, 1.9, 2.9, 1.15, 7, 17, dk('#3a2a20', d));
  box(g, 1.9, 1.15, 1.0, 0.5, 5, 2, { top:'#5a4535', l:'#4a382b', r:'#3e2f24' }, d);
}
/* 대표 책상과 책상 위 물건. 뒤쪽(책장·의자)과 나눠서 그 사이에 대표가 앉는다 */
export function drawCeoDesk(g: G, d: number): void {
  box(g, 1.3, 1.85, 2.2, 0.75, 0, 12, { top:'#8a5a34', l:'#6e4626', r:'#5c3a1f' }, d);
  // 책상 위: 모니터(왼쪽, 대표를 향해 있어 뒷면이 보인다. 얼굴을 가리지 않게 옆으로), 키보드(대표 앞), 마우스, 서류(오른쪽)
  // 책상 가운데(x 2.4)에 대표가 앉고, 같은 줄에 키보드(사람 쪽) → 모니터(책상 앞쪽). 서류는 오른쪽
  box(g, 2.04, 1.95, 0.72, 0.22, 12, 0.8, { top:'#d9dde2', l:'#aeb4bb', r:'#9ea4ab' }, d);
  for (let i = 0; i < 5; i++) poly(g, tileP(2.1 + i*0.13, 1.99, 2.17 + i*0.13, 2.12, 12.8), dk('#9ea5ad', d));
  box(g, 3.02, 2.15, 0.36, 0.3, 12, 1, { top:'#f1efe8', l:'#d6d3ca', r:'#cac6bc' }, d);
  // 왼쪽 빈 자리 장식: 안쪽에 머그컵, 앞쪽에 작은 선인장 화분
  box(g, 1.36, 1.95, 0.16, 0.16, 12, 3.2, { top:'#3a2a20', l:'#f1efe8', r:'#d6d3ca' }, d);
  box(g, 1.52, 2.0, 0.05, 0.06, 13, 1.5, { top:'#e6e3dc', l:'#d6d3ca', r:'#c9c5bb' }, d);
  box(g, 1.4, 2.25, 0.24, 0.24, 12, 3.5, { top:'#c9714a', l:'#b25e3a', r:'#9c5032' }, d);
  box(g, 1.47, 2.32, 0.1, 0.1, 15.5, 7, { top:'#6fbf73', l:'#4f9e58', r:'#3f8a4b' }, d);
  box(g, 1.41, 2.35, 0.06, 0.06, 18, 3, { top:'#6fbf73', l:'#4f9e58', r:'#3f8a4b' }, d);
  box(g, 1.57, 2.34, 0.06, 0.06, 19.5, 2.5, { top:'#6fbf73', l:'#4f9e58', r:'#3f8a4b' }, d);
  box(g, 2.25, 2.36, 0.3, 0.18, 12, 0.8, { top:'#4a505a', l:'#3a3f47', r:'#30353c' }, d);
  box(g, 2.36, 2.42, 0.08, 0.06, 12.8, 2, { top:'#4a505a', l:'#3a3f47', r:'#30353c' }, d);
  box(g, 2.07, 2.46, 0.66, 0.07, 14.5, 10, { top:'#454b55', l:'#363b43', r:'#2b2f36' }, d);
  planeY(g, 2.32, 2.47, 2.53, 19, 20.3, dk('#6b7380', d));
}
/* 대표실 유리벽과 문: 대표가 방 안팎을 걸어 다니므로 짧은 조각으로 나눠 앞뒤 순서를 맞춘다 */
const ceoGlassCol = (d: number) => d > 0.5 ? 'rgba(70,90,120,.32)' : 'rgba(176,214,232,.34)';
export function drawCeoGlassX(g: G, a: number, b: number, d: number): void {   // 오른쪽 유리벽 (x = x1) 의 y a~b 조각
  const x1 = CEO.x1;
  planeX(g, x1, a, b, 0, 7, dk('#b9b2a4', d)); planeX(g, x1, a, b, 7, 40, ceoGlassCol(d)); planeX(g, x1, a, b, 40, 42, dk('#8e969e', d));
  for (let y = 1.1; y < CEO.y1; y += 1.1) if (y >= a && y < b) planeX(g, x1, y-0.04, y+0.04, 7, 40, dk('#8e969e', d));
}
export function drawCeoGlassY(g: G, a: number, b: number, d: number): void {   // 앞 유리벽 (y = y1) 의 x a~b 조각 (문 자리 제외)
  const y1 = CEO.y1;
  planeY(g, a, b, y1, 0, 7, dk('#b9b2a4', d)); planeY(g, a, b, y1, 7, 40, ceoGlassCol(d)); planeY(g, a, b, y1, 40, 42, dk('#8e969e', d));
}
export function drawCeoDoor(g: G, d: number, open: boolean): void {
  const { y1, door0, door1 } = CEO;
  planeY(g, door0-0.1, door1+0.1, y1, 40, 42, dk('#8e969e', d));
  planeY(g, door0-0.1, door1+0.1, y1, 0, 40, dk('#3e2615', d));
  if (open) {   // 열린 문: 안쪽으로 젖혀진 문짝 옆면만 보인다
    planeY(g, door0, door1, y1, 0, 37, dk('#4a3020', d));
    planeX(g, door0 + 0.04, y1 - 0.9, y1, 0, 37, dk('#7a4b2a', d));
    return;
  }
  planeY(g, door0, door1, y1, 0, 37, dk('#7a4b2a', d));
  planeY(g, door0+0.15, door1-0.15, y1, 20, 33, dk('#8c5a34', d));
  planeY(g, door0+0.15, door1-0.15, y1, 4, 17, dk('#84552f', d));
  planeY(g, door1-0.3, door1-0.22, y1, 16, 21, dk('#e0b44c', d));
  // 문에 건 대표실 현판 (윗판 가운데)
  planeY(g, door0+0.22, door1-0.22, y1, 25, 32, dk('#8a6420', d));
  planeY(g, door0+0.27, door1-0.27, y1, 25.6, 31.4, dk('#d4a63a', d));
}

const DESK = { top:'#d8a86f', l:'#ab7741', r:'#91612f' };
export function drawChair(g: G, dx: number, dy: number, d: number): void {
  const x0 = dx - 0.48, x1 = dx + 0.08;
  planeY(g, x0, x1, dy-0.95, 7, 17, dk('#3a4351', d)); planeY(g, x0+0.05, x1-0.05, dy-0.95, 15, 17, dk('#4b5565', d));
  box(g, x0, dy-0.95, x1-x0, 0.55, 5, 2, { top:'#56606f', l:'#475060', r:'#3d4553' }, d);
}
/* 책상 명패: 책상 앞면에 붙인 작은 판. 판 색으로 자리 상태를 나타낸다 */
export type PlateKind = 'meet' | 'on' | 'away' | 'break' | 'sel';
export type DeskState = 'off' | 'on' | 'away' | 'break' | 'meet';
export const PLATE: Record<PlateKind, [string, string]> = { meet:['#2f7a80','#f3efe6'], on:['#2f3438','#f3efe6'], away:['#5b4796','#f3efe6'], break:['#55687a','#f3efe6'], sel:['#f0b445','#2a2006'] };
export function drawPlate(g: G, dx: number, dy: number, kind: PlateKind, d: number): void {
  const bg = PLATE[kind][0];
  planeY(g, dx - 0.6, dx + 0.6, dy + 0.3, 2, 10, dk(bg, d));
  planeY(g, dx - 0.6, dx + 0.6, dy + 0.3, 9.4, 10, dk(shade(bg, .25), d));
}
/* 이동식 화이트보드 */
export function drawEasel(g: G, x: number, y: number, d: number): void {
  box(g, x, y, 0.5, 0.5, 0, 2, { top:'#8e969e', l:'#7a828a', r:'#6b737b' }, d);
  planeX(g, x + 0.22, y + 0.2, y + 0.3, 2, 14, dk('#6b737b', d));
  planeX(g, x + 0.3, y - 0.15, y + 0.65, 14, 32, dk('#8e969e', d));
  planeX(g, x + 0.31, y - 0.08, y + 0.58, 15, 31, dk('#fbfbf8', d));
  planeX(g, x + 0.32, y + 0.05, y + 0.35, 26, 27, dk('#4a7fc1', d));
  planeX(g, x + 0.32, y + 0.0, y + 0.45, 22, 23, dk('#c4493f', d));
}
/* 회의 테이블 한 칸: 자리마다 테이블 조각 하나(앞뒤 순서를 맞추려고 조각으로 나눔), 사람이 앉으면 노트북을 연다 */
export function drawMeetTable(g: G, dx: number, dy: number, on: boolean, d: number): void {
  box(g, dx - 0.35, dy - 0.3, 0.7, 0.6, 0, 12, { top:'#e3dfd6', l:'#a9a397', r:'#938d81' }, d);
  if (on) {
    box(g, dx - 0.05, dy - 0.24, 0.4, 0.26, 12, 1, { top:'#a9b0b8', l:'#868e97', r:'#7b838c' }, d);
    planeY(g, dx + 0.02, dx + 0.3, dy + 0.02, 13, 19, dk('#c6ccd3', d));
  }
}
export function drawDesk(g: G, dx: number, dy: number, st: DeskState, d: number): void {
  box(g, dx-0.65, dy-0.3, 1.3, 0.6, 0, 12, DESK, d);
  poly(g, tileP(dx-0.52, dy-0.18, dx-0.18, dy+0.16, 12), dk('#f1efe8', d));
  if (st === 'off' || st === 'break' || st === 'meet') {
    box(g, dx+0.15, dy-0.24, 0.45, 0.3, 12, 1, { top:'#9aa2ab', l:'#7d858e', r:'#737b84' }, d);
    if (st === 'break') { const [mx,my] = iso(dx-0.1, dy+0.05, 12); g.fillStyle = dk('#fbfaf5', d); g.fillRect(Math.round(mx)-1, Math.round(my)-3, 3, 3); g.fillStyle = dk('#6b4a2e', d); g.fillRect(Math.round(mx)-1, Math.round(my)-3, 3, 1); }
    return;
  }
  box(g, dx+0.15, dy-0.24, 0.45, 0.28, 12, 1, { top:'#a9b0b8', l:'#868e97', r:'#7b838c' }, d);
  planeY(g, dx+0.22, dx+0.52, dy+0.04, 13, 20, dk('#c6ccd3', d)); planeY(g, dx+0.49, dx+0.52, dy+0.04, 13, 20, dk('#9aa1a9', d));
  const [cx,cy] = iso(dx+0.37, dy+0.04, 16.5), X = Math.round(cx), Y = Math.round(cy);
  if (st === 'away') { g.fillStyle = dk('#f4d35e', d); g.fillRect(X-3, Y-4, 6, 7); glyph(g, X-1, Y-3, QMARK, dk('#5a4410', d)); }
  else { g.fillStyle = dk('#e9edf1', d); g.fillRect(X-1, Y-1, 2, 2); }
}
const SOFA_BACK = { top:'#4a5d6e', l:'#55697b', r:'#425464' }, SOFA_SEAT = { top:'#6f8799', l:'#5a7182', r:'#4d6272' };
export function loungeItems(g: CanvasRenderingContext2D, z: LoungeZone, d: number): { k: number; f: () => void }[] {
  const dl = dq(d);
  return z.items.map(it => ({ k: it.k, f: () => sprite(g, `lg${it.t}${it.x.toFixed(2)},${it.y.toFixed(2)},${(it.w||0).toFixed(2)}:${dl}`, c => drawLoungeItem(c, it, dl/20)) }));
}
function drawLoungeItem(g: G, it: LoungeItem, d: number): void {
  const w = it.w ?? 0;
  if (it.t === 'back') box(g, it.x, it.y, w, 0.32, 0, 15, SOFA_BACK, d);
  else if (it.t === 'seat') box(g, it.x, it.y, w, 0.6, 0, 7, SOFA_SEAT, d);
  else if (it.t === 'table') {
    box(g, it.x, it.y, w, 0.55, 0, 5, { top:'#b8875a', l:'#8e6136', r:'#7a522d' }, d);
    box(g, it.x + w/2 - 0.09, it.y + 0.18, 0.18, 0.18, 5, 3, { top:'#fbfaf5', l:'#dcd9d0', r:'#cfcbc1' }, d);
  } else if (it.t === 'machine') {
    box(g, it.x, it.y, 0.6, 0.5, 0, 26, { top:'#5c6670', l:'#6c7782', r:'#525b64' }, d);
    planeY(g, it.x + 0.1, it.x + 0.5, it.y + 0.5, 14, 22, dk('#2b2f33', d));
    planeY(g, it.x + 0.18, it.x + 0.42, it.y + 0.5, 6, 9, dk('#d9b65a', d));
  } else if (it.t === 'plant') drawPlant(g, it.x, it.y, d);
}
