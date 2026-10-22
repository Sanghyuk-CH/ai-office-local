/* ── 배경 그림 (층마다 한 장, 층 안 좌표로 그린다) ── */
import { CEO, NIGHT_A, PXA, SLAB, WALL } from './constants';
import { box, dq, iso, planeX, planeY, poly, tileP, type G } from './iso';
import type { Floor, Light, Pt, Zone } from './model';
import { E } from './state';
import { ctx2d, dk, mix, mk, shade } from './util';

const WB_X0 = 1.0, WB_X1 = 3.0;         // 프로젝트 층 뒷벽 화이트보드
export const signY = (f: Floor): Pt => f.ceo ? [4.7, 7.5] : [3.0, 7.5];   // 왼쪽 벽 층 간판 (엘리베이터 문 뒤쪽)
function windowsList(): Pt[] {
  const w: Pt[] = [];
  if (E.CF.ceo) w.push([2.95, 4.05]);   // 대표실 안 뒷벽 작은 창 (대표가 창가에 선다)
  for (let x = E.CF.ceo ? 5.6 : 4.0; x + 1.7 < E.NX - 1.6; x += 2.8) w.push([x, x + 1.7]);
  return w;
}
export function drawPlant(g: G, x: number, y: number, d = 0): void {
  box(g, x-0.25, y-0.25, 0.5, 0.5, 0, 7, { top:'#4b5a6a', l:'#56677a', r:'#475666' }, d);
  const [px,py] = iso(x, y, 7), X = Math.round(px), Y = Math.round(py);
  for (const [lx,ly,w,h,col] of [[-6,-6,5,4,'#3f8a52'],[2,-8,5,5,'#4f9e60'],[-3,-13,6,6,'#5aae6b'],[-8,-12,4,4,'#3f8a52'],[3,-15,4,5,'#3f8a52'],[-1,-19,4,5,'#4f9e60']] as [number, number, number, number, string][]) { g.fillStyle = dk(col,d); g.fillRect(X+lx, Y+ly, w, h); }
}
const rugPoly = (g: G, x0: number, y0: number, x1: number, y1: number, c: number, col: string) => poly(g, [iso(x0 + c, y0), iso(x1 - c, y0), iso(x1, y0 + c), iso(x1, y1 - c), iso(x1 - c, y1), iso(x0 + c, y1), iso(x0, y1 - c), iso(x0, y0 + c)], col);
// 밝은 색: 원목 바닥, 따뜻한 흰 벽. 대표실 층 바닥은 한 톤 진하게
const BRIGHT = { tA:'#e8d3ad', tB:'#e1c9a0', cA:'#dcc59c', cB:'#d4bb91', wallL:'#f3ecdf', wallR:'#e3d8c5', wainL:'#e6dac6', wainR:'#d6c8b1', railL:'#d3c4aa', railR:'#c6b69b', base:'#bba98c', baseR:'#ad9b7f', cap:'#fffaf1', capEdgeL:'#d8cab2', capEdgeR:'#cbbca2' };
const LOUNGE_FLOOR = '#cdbfa6';
const rugBase = (z: Zone) => z.kind === 'team' ? mix('#f1e6d2', z.color, .32) : z.kind === 'meet' ? '#e2e8ee' : '#efe4cf';
function drawBg(g: CanvasRenderingContext2D): void {
  const { NX, NY, DOORY, CF } = E;
  // 바닥판 옆면(층이 떠 있는 두께)
  poly(g, [iso(0,NY), iso(NX,NY), iso(NX,NY,-SLAB), iso(0,NY,-SLAB)], '#b9ab95');
  poly(g, [iso(NX,NY), iso(NX,0), iso(NX,0,-SLAB), iso(NX,NY,-SLAB)], '#a89a84');
  poly(g, [iso(0,NY,-SLAB+1), iso(NX,NY,-SLAB+1), iso(NX,NY,-SLAB), iso(0,NY,-SLAB)], '#958771');
  const tA = CF.ceo ? BRIGHT.cA : BRIGHT.tA, tB = CF.ceo ? BRIGHT.cB : BRIGHT.tB;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) poly(g, tileP(i,j,i+1,j+1), (i+j)&1 ? tA : tB);
  const wins = windowsList();
  for (const [a,b] of wins) poly(g, tileP(a, 0.05, b, 1.6), 'rgba(255,250,232,.28)');
  // 엘리베이터 앞 발판
  poly(g, tileP(0.2, DOORY - 0.7, 1.5, DOORY + 0.7), '#8f9086'); poly(g, tileP(0.32, DOORY - 0.58, 1.38, DOORY + 0.58), '#a3a49a');
  // 러그: 모서리를 깎은 사각형. 앞쪽 띠에 구역 이름이 들어간다
  for (const z of E.zones) {
    const base = rugBase(z);
    if (z.kind === 'lounge') {
      // 휴게실: 러그 대신 방 바닥 전체를 카펫으로. 바깥 벽에 붙은 쪽은 벽까지 깐다
      const xa = z.x0 <= 0.7 ? 0 : z.x0, ya = z.y0 <= 0.7 ? 0 : z.y0;
      poly(g, tileP(xa, ya, z.x1, z.y1), LOUNGE_FLOOR);
      poly(g, tileP(z.x0 + 0.5, z.y1 - 0.8, z.x1 - 1.3, z.y1 - 0.3), shade(LOUNGE_FLOOR, -.05));
      continue;
    }
    rugPoly(g, z.x0, z.y0, z.x1, z.y1, 0.45, shade(base, -.12));
    rugPoly(g, z.x0 + 0.12, z.y0 + 0.12, z.x1 - 0.12, z.y1 - 0.12, 0.38, base);
    poly(g, tileP(z.x0 + 0.5, z.y1 - 0.8, z.x1 - 0.5, z.y1 - 0.3), shade(base, -.06));
  }
  for (const [x, y] of E.decor) drawPlant(g, x, y);
  if (CF.ceo) {
    poly(g, tileP(CEO.x0, CEO.y0, CEO.x1, CEO.y1), '#713439');
    rugPoly(g, 0.5, 2.8, 4.3, 4.1, 0.25, '#c9a24a'); rugPoly(g, 0.62, 2.92, 4.18, 3.98, 0.2, '#3d5a4c');
  }
  // 벽 (낮게) + 위에서 보이는 두께
  // 두 벽은 밝기를 달리하고, 아래쪽 판벽·몰딩·모서리 선으로 면을 나눠 밋밋한 흰 면이 되지 않게
  planeX(g, 0, 0, NY, 0, WALL, BRIGHT.wallL); planeY(g, 0, NX, 0, 0, WALL, BRIGHT.wallR);
  planeX(g, 0, 0, NY, 0, 14, BRIGHT.wainL); planeY(g, 0, NX, 0, 0, 14, BRIGHT.wainR);
  planeX(g, 0, 0, NY, 14, 15.5, BRIGHT.railL); planeY(g, 0, NX, 0, 14, 15.5, BRIGHT.railR);
  planeX(g, 0, 0, NY, 0, 3, BRIGHT.base); planeY(g, 0, NX, 0, 0, 3, BRIGHT.baseR);
  poly(g, [iso(0,NY,0), iso(0,NY,WALL), iso(-0.3,NY,WALL), iso(-0.3,NY,0)], '#d6c8b0');
  poly(g, [iso(NX,0,0), iso(NX,0,WALL), iso(NX,-0.3,WALL), iso(NX,-0.3,0)], '#c9baa1');
  // 벽 위 두께: ㄱ자를 한 번에 칠하면 안쪽까지 채워지므로 두 조각으로 나눠 칠한다
  poly(g, [iso(-0.3,-0.3,WALL), iso(NX,-0.3,WALL), iso(NX,0,WALL), iso(0,0,WALL)], BRIGHT.cap);
  poly(g, [iso(-0.3,-0.3,WALL), iso(0,0,WALL), iso(0,NY,WALL), iso(-0.3,NY,WALL)], BRIGHT.cap);
  planeY(g, 0, NX, 0, WALL - 1.5, WALL, BRIGHT.capEdgeR); planeX(g, 0, 0, NY, WALL - 1.5, WALL, BRIGHT.capEdgeL);
  { const [bx,by] = iso(0,0,WALL); g.fillStyle = '#c4b59b'; g.fillRect(bx - 0.5, by, 1, WALL); }
  for (const [a,b] of wins) {
    planeY(g,a-0.1,b+0.1,0,12,38,'#a9b2bb'); planeY(g,a,b,0,14.5,35.5,'#b7dcef');
    planeY(g,a+0.15,a+0.45,0,17,33,'#dcf0fa'); planeY(g,(a+b)/2-0.05,(a+b)/2+0.05,0,14.5,35.5,'#a9b2bb');
    planeY(g,a-0.16,b+0.16,0,10,12,'#d9ccb6');
  }
  { const cx0 = NX - 1.3; planeY(g, cx0, cx0 + 0.6, 0, 28, 37, '#5a6068'); planeY(g, cx0 + 0.08, cx0 + 0.52, 0, 29, 36, '#fbf8f0');
    const [cx,cy] = iso(cx0 + 0.3, 0, 32.5); g.fillStyle = '#2b2f33'; g.fillRect(Math.round(cx), Math.round(cy)-3, 1, 3); g.fillRect(Math.round(cx), Math.round(cy), 2, 1); }
  if (!CF.ceo) {
    planeY(g,WB_X0,WB_X1,0,13,34,'#b5bcc4'); planeY(g,WB_X0+0.1,WB_X1-0.1,0,14.5,32.5,'#ffffff');
    planeY(g,WB_X0+0.35,WB_X0+1.3,0,28,29,'#4a7fc1'); planeY(g,WB_X0+0.3,WB_X0+1.6,0,23.5,24.5,'#c4493f'); planeY(g,WB_X0+0.4,WB_X0+1.0,0,19,20,'#3f9b63');
  }
  // 왼쪽 벽 층 간판 (글씨는 따로 쓴다)
  { const [s0, s1] = signY(CF); planeX(g,0,s0,s1,20,33,CF.ceo ? '#3a2a1e' : '#30383d'); planeX(g,0,s0+0.1,s1-0.1,21.5,31.5,CF.ceo ? '#4a3626' : '#3c464c'); }
  // 엘리베이터 문: 벽을 뚫어 뒤의 승강로가 보이게 하고, 문틀·층 표시판·호출 버튼을 단다
  g.save(); g.globalCompositeOperation = 'destination-out'; planeX(g, 0, DOORY - 0.62, DOORY + 0.62, 0, 30, '#000'); g.restore();
  planeX(g,0,DOORY-0.8,DOORY-0.62,0,33,'#8a939c'); planeX(g,0,DOORY+0.62,DOORY+0.8,0,33,'#8a939c'); planeX(g,0,DOORY-0.8,DOORY+0.8,30,33,'#8a939c');
  planeX(g,0,DOORY-0.45,DOORY+0.45,34.5,40,'#2b2f33');
  planeX(g,0,DOORY-1.15,DOORY-0.95,12,17,'#9aa2aa'); planeX(g,0,DOORY-1.09,DOORY-1.01,13.5,15.5,'#f0b445');
}
/* 밤 덮개: 층마다 도트 격자에 한 장으로 칠한다. 전체(복도)를 먼저 칠하고,
   구역·대표실 칸은 지운 뒤 그 구역의 어두운 정도로 다시 칠해서 경계에 틈이나 겹침이 없다.
   불이 켜지고 꺼지는 동안에만 다시 그린다 */
export function darkOverlay(f: Floor): HTMLCanvasElement | null {
  const { NX, NY, W0, FH0 } = E;
  const regs: [Light, Pt[]][] = f.zones.map(z => [z.light, tileP(z.x0, z.y0, z.x1, z.y1)]);
  if (f.ceo) regs.push([f.L.ceo!, tileP(CEO.x0, CEO.y0, CEO.x1, CEO.y1)]);
  const key = dq(1 - f.L.common.lit) + '|' + regs.map(r => dq(1 - r[0].lit)).join(',');
  if (key === f.darkKey) return f.DARKC;
  f.darkKey = key;
  if (!/[1-9]/.test(key)) { f.DARKC = null; return null; }
  if (!f.DARKC || f.DARKC.width !== Math.ceil(W0*PXA) || f.DARKC.height !== Math.ceil(FH0*PXA)) f.DARKC = mk(Math.ceil(W0*PXA), Math.ceil(FH0*PXA));
  const g = ctx2d(f.DARKC), fill = (d: number) => `rgba(10,14,32,${NIGHT_A * d})`;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, f.DARKC.width, f.DARKC.height);
  g.setTransform(PXA, 0, 0, PXA, 0, 0);
  // 이 층의 바닥·벽 모양만 덮는다(층 사이 빈 곳은 덮지 않음)
  const shape = [iso(-0.3,-0.3,WALL), iso(NX,-0.3,WALL), iso(NX,-0.3,-SLAB), iso(NX,NY,-SLAB), iso(0,NY,-SLAB), iso(-0.3,NY,-SLAB), iso(-0.3,NY,WALL)];
  poly(g, shape, fill(dq(1 - f.L.common.lit) / 20));
  for (const [l, pts] of regs) {
    g.globalCompositeOperation = 'destination-out'; poly(g, pts, '#000');
    g.globalCompositeOperation = 'source-over';
    const d = dq(1 - l.lit) / 20; if (d > 0) poly(g, pts, fill(d));
  }
  return f.DARKC;
}
export function buildBackground(f: Floor): void {
  f.darkKey = ''; f.DARKC = null;
  f.BGC = mk(Math.ceil(E.W0*PXA), Math.ceil(E.FH0*PXA));
  const g = ctx2d(f.BGC); g.setTransform(PXA, 0, 0, PXA, 0, 0); drawBg(g);
}
