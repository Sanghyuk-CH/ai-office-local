/* ── 캐릭터 스프라이트 시트 (4열×3행) ── */
import { FH, FW, NIGHT_A } from './constants';
import type { Sheet } from './model';
import { E } from './state';
import { ctx2d, hash, mk, shade } from './util';

const SKINS = [['#f6d5b8','#e2b392'],['#eec59f','#d4a179'],['#d8a477','#bb875d'],['#b97f55','#9c673f']];
const HAIRS = [['#2a2223','#191415','#4a3d3e'],['#5b3b25','#3f2818','#80583a'],['#8b9099','#6c717a','#b4b9c1'],['#c4843c','#a2692a','#e3a964'],['#24304d','#161e33','#3e4d73']];
const SHIRTS = ['#4f86c6','#e2735a','#5aae7b','#9b6fc6','#e2b53c','#d0667d','#3ea6a4','#7c8b9c','#cc8a3d'];
const PANTS = [['#38415a','#2c3448'],['#4c4137','#3b3229'],['#2f3c35','#243029'],['#57515d','#45404b']];

interface SheetParams {
  skin: string; skinD: string; hair: string; hairD: string; hairL: string;
  shirt: string; shirtD: string; pants: string; pantsD: string;
  style: number; cap: boolean; mug?: boolean; empty?: boolean;
}
interface HeadOpts { side?: boolean; closed?: boolean; open?: boolean }

function makeSheet(p: SheetParams): HTMLCanvasElement {
  const c = mk(FW*4, FH*3), g = ctx2d(c);
  let F = 0;
  const R = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect((F%4)*FW + x, ((F/4)|0)*FH + y, w, h); };
  const EYE = '#2a2230', WH = '#fbfaf5', BL = 'rgba(236,140,140,.85)';
  const S = p.skin, SD = p.skinD, H = p.hair, HL = p.hairL, C = p.shirt, CD = p.shirtD, P = p.pants, PD = p.pantsD, SH = '#2a2727';
  function head(x: number, y: number, o: HeadOpts = {}){
    R(x+1,y,6,1,H); R(x,y+1,8,2,H); R(x+2,y+1,2,1,HL);
    R(x+1,y+3,6,5,S); R(x+1,y+7,6,1,SD);
    if (o.side) { R(x,y+3,2,4,H); R(x+1,y+3,4,1,H); }
    else {
      R(x,y+3,1,2,H); R(x+7,y+3,1,2,H);
      if (p.style === 1) { R(x+1,y+3,5,1,H); R(x+1,y+4,1,1,H); } else { R(x+1,y+3,3,1,H); R(x+5,y+3,2,1,H); }
      if (p.style === 2) { R(x,y+5,1,3,H); R(x+7,y+5,1,3,H); }
    }
    if (o.closed) { R(x+2,y+5,2,1,EYE); R(x+5,y+5,2,1,EYE); }
    else if (o.side) { R(x+4,y+4,1,2,EYE); R(x+6,y+4,1,2,EYE); }
    else { R(x+2,y+4,1,2,EYE); R(x+5,y+4,1,2,EYE); }
    if (!o.side) { R(x+1,y+6,1,1,BL); R(x+6,y+6,1,1,BL); }
    if (o.open) R(x+3,y+6,2,1,'#8c3f3a'); else if (!o.side) R(x+3,y+6,2,1,'#d79a86');
    if (p.cap) {   // 하위 작업자 노란 모자
      R(x+1,y-1,6,1,'#f2c94c'); R(x,y,8,2,'#f2c94c'); R(x+2,y,2,1,'#fbe39a');
      if (o.side) R(x+5,y+2,4,1,'#c99a1e'); else R(x,y+2,8,1,'#c99a1e');
    }
  }
  function torso(x: number, y: number, h: number){ R(x,y,8,h,C); R(x+7,y,1,h,CD); R(x,y+h-1,8,1,CD); R(x+3,y,2,1,WH); }
  function legsStand(y: number){ R(5,y,3,6,P); R(8,y,3,6,P); R(8,y+2,1,4,PD); R(5,y+6,3,2,SH); R(8,y+6,3,2,SH); }
  for (let i = 0; i < 4; i++) {
    F = i; const b = i % 2 === 0 ? 1 : 0;
    if (i % 2 === 0) { const sw = i === 2; R(4,16+b,3,5, sw?P:PD); R(9,16+b,3,5, sw?PD:P); R(3,21+b,3,2,SH); R(10,21+b,3,2,SH); }
    else { R(6,16,4,6,P); R(8,16,1,6,PD); R(6,22,5,2,SH); }
    torso(4,10+b,6); R(3,11+b,1,4,CD); R(12,11+b,1,4,CD); R(3,15+b,1,1,S); R(12,15+b,1,1,S);
    if (p.mug) { R(12,13+b,3,3,WH); R(12,13+b,3,1,'#6b4a2e'); R(15,14+b,1,1,WH); }   // 걸을 때도 커피잔을 든다
    head(4,2+b,{side:true});
  }
  for (let i = 0; i < 2; i++) {
    F = 4 + i; R(5,18,6,6,P); torso(4,12,6);
    const la = i === 0 ? 13 : 14, ra = i === 0 ? 14 : 13;
    R(3,12,1,la-11,CD); R(4,la,2,1,S); R(12,12,1,ra-11,CD); R(10,ra,2,1,S);
    head(4,4);
  }
  F = 6; legsStand(16); torso(4,10,6); R(3,5,1,6,CD); R(12,5,1,6,CD); R(3,4,1,1,S); R(12,4,1,1,S); head(4,2,{closed:true,open:true});
  F = 7; R(5,14,3,5,P); R(8,14,3,5,P); R(8,15,1,4,PD); R(5,19,3,2,SH); R(8,19,3,2,SH); torso(4,8,6);
  R(2,4,1,4,CD); R(3,7,1,2,CD); R(13,4,1,4,CD); R(12,7,1,2,CD); R(2,3,1,1,S); R(13,3,1,1,S); head(4,0,{closed:true,open:true});
  F = 8; R(5,18,6,6,P); torso(4,12,6); R(3,12,1,3,CD); R(4,14,2,1,S);
  R(12,12,1,2,CD); R(12,11,1,1,S); R(12,8,3,3,WH); R(12,8,3,1,'#6b4a2e'); R(15,9,1,1,WH); head(4,4);
  F = 9; R(5,18,6,6,P); torso(4,13,6); head(4,7,{closed:true}); R(3,14,10,2,CD); R(5,14,2,1,S); R(9,14,2,1,S);
  F = 10; legsStand(16); torso(4,10,6);
  if (p.mug) { R(3,11,1,4,CD); R(3,15,1,1,S); R(12,11,1,2,CD); R(11,13,2,1,S); R(11,10,3,3,WH); R(11,10,3,1,'#6b4a2e'); R(14,11,1,1,WH); }   // 대표: 커피잔을 들고 서 있다
  else if (p.empty) { R(3,11,1,4,CD); R(12,11,1,4,CD); R(3,15,1,1,S); R(12,15,1,1,S); }   // 빈손으로 서 있기
  else { R(3,11,1,3,CD); R(12,11,1,3,CD); R(6,12,4,5,WH); R(7,13,2,1,'#aeb4bd'); R(7,15,2,1,'#aeb4bd'); R(5,14,1,1,S); R(10,14,1,1,S); }
  head(4,2);
  F = 11; torso(4,15,4); head(4,9,{closed:true}); R(3,18,10,3,P); R(7,18,2,3,PD); R(3,21,4,3,SH); R(9,21,4,3,SH);
  R(3,16,1,2,CD); R(12,16,1,2,CD); R(4,18,2,1,S); R(10,18,2,1,S);
  return c;
}
// 대표(나): 짙은 남색 재킷, 정해진 얼굴
// 커피잔을 든 모습(사무실 안·순회)과 빈손(출퇴근) 두 장
const CEO_SHEETS: Partial<Record<0 | 1, HTMLCanvasElement>> = {};
export const ceoSheet = (mug = true): Sheet => E.SPRITE_IMG || CEO_SHEETS[mug ? 1 : 0] || (CEO_SHEETS[mug ? 1 : 0] = makeSheet({ skin:SKINS[1][0], skinD:SKINS[1][1], hair:HAIRS[0][0], hairD:HAIRS[0][1], hairL:HAIRS[0][2],
  shirt:'#34405c', shirtD:'#252e44', pants:PANTS[0][0], pantsD:PANTS[0][1], style:1, cap:false, mug, empty: !mug }));
const sheetCache = new Map<string, HTMLCanvasElement>();
export function sheetFor(id: string, parentId: string | null | undefined): Sheet {
  if (E.SPRITE_IMG) return E.SPRITE_IMG;
  const h = hash(id), cap = !!parentId;
  const si = h % SKINS.length, hi = (h >>> 3) % HAIRS.length, pi = (h >>> 11) % PANTS.length, st = (h >>> 14) % 3;
  const ci = ((cap ? hash(String(parentId)) : h) >>> 7) % SHIRTS.length;   // 하위 작업자는 상위 세션과 같은 색 옷
  const key = [si,hi,ci,pi,st,cap?1:0].join('-');
  let sheet = sheetCache.get(key);
  if (!sheet) {
    const sh = SHIRTS[ci];
    sheet = makeSheet({ skin:SKINS[si][0], skinD:SKINS[si][1], hair:HAIRS[hi][0], hairD:HAIRS[hi][1], hairL:HAIRS[hi][2],
      shirt:sh, shirtD:shade(sh,-.22), pants:PANTS[pi][0], pantsD:PANTS[pi][1], style:st, cap });
    sheetCache.set(key, sheet);
  }
  return sheet;
}
const darkCache = new WeakMap<Sheet, HTMLCanvasElement>();
export function darkOf(img: Sheet): HTMLCanvasElement {
  let d = darkCache.get(img);
  if (!d) { d = mk(img.width, img.height); const g = ctx2d(d); g.drawImage(img,0,0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(10,14,32,${NIGHT_A})`; g.fillRect(0,0,d.width,d.height); darkCache.set(img, d); }
  return d;
}
