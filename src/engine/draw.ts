/* ── 그리기 ── */
import { regionAt, useFloor } from './building';
import { allPeople } from './ceo';
import { camApply } from './camera';
import { CEO, CEO_DOOR, CEO_ID, F_BODY, F_DISPLAY, FH, FW, HEAD, HW, PART, PART_H, QMAX, QSTEP, QX, QY } from './constants';
import {
  drawCeo, drawCeoDesk, drawCeoDoor, drawCeoGlassX, drawCeoGlassY, drawChair, drawDesk, drawEasel, drawMeetTable, drawPlate,
  loungeItems, PLATE, type DeskState, type PlateKind,
} from './furniture';
import { darkOverlay, signY } from './background';
import { box, dq, glyph, iso, sprite, Z4, Z5 } from './iso';
import type { Actor, Floor, TeamZone } from './model';
import { minsSince } from './people';
import { drawLandingDoor, drawShaft, drawShaftLabels } from './shaft';
import { darkOf } from './sprites';
import { E } from './state';
import { bubble, pill, planeText } from './text';
import { clamp, ctx2d, dk, fmtMin, mk, shade, trunc } from './util';

const plateText = new Map<string, string>();
function fitName(name: string, fontPx: number): string {
  const key = name + '|' + fontPx.toFixed(2);
  let t = plateText.get(key);
  if (t == null) {
    const m = ctx2d(mk(1,1)); m.font = `600 ${fontPx}px ${F_BODY}`;
    const maxW = 1.08 * HW;
    t = name;
    if (m.measureText(t).width > maxW) { let n = name.length; while (n > 1 && m.measureText(name.slice(0, n) + '…').width > maxW) n--; t = name.slice(0, n) + '…'; }
    plateText.set(key, t);
  }
  return t;
}
const plateKind = (id: string, st: DeskState): PlateKind => E.sel === id ? 'sel' : (st === 'away' || st === 'break' || st === 'meet') ? st : 'on';
function drawPlateText(g: CanvasRenderingContext2D, dx: number, dy: number, id: string, kind: PlateKind, d: number): void {
  const fg = PLATE[kind][1], view = E.view;
  const s = E.DATA && E.DATA.smap.get(id); if (!s) return;
  const font = 8.5 / (view.kz / view.u);  // 화면에서 8.5px로 보이게 (확대하면 더 많은 글자가 들어감)
  if (font > 7.2) return;                        // 화면이 너무 좁으면 판만 둔다
  const [px, py] = iso(dx, dy + 0.3, 6), K = view.kz;
  g.save();
  g.setTransform(K, 0.5*K, 0, K, px*K + view.ox, py*K + view.oy);
  g.font = `600 ${font}px ${F_BODY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = dk(fg, d * 0.6);
  g.fillText(fitName(s.name, font), 0, 0.3);
  g.restore();
}
function drop(g: CanvasRenderingContext2D, x: number, y: number, ph: number, al0: number){
  const yy = y + Math.round(ph*8), al = (ph < 0.75 ? 1 : (1 - ph) / 0.25) * al0;
  g.fillStyle = `rgba(96,186,236,${al})`; g.fillRect(x, yy+1, 2, 2); g.fillRect(x, yy, 1, 1);
  g.fillStyle = `rgba(236,250,255,${al})`; g.fillRect(x, yy+1, 1, 1);
}
function star(g: CanvasRenderingContext2D, x: number, y: number, big: boolean){
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#ffd84a'; g.fillRect(x-1, y, 3, 1); g.fillRect(x, y-1, 1, 3);
  if (big) { g.fillRect(x-2, y, 5, 1); g.fillRect(x, y-2, 1, 5); }
  g.fillStyle = '#fff6c4'; g.fillRect(x, y, 1, 1);
}
export function drawSheet(g: CanvasRenderingContext2D, a: Actor, X: number, Y: number, f: number, dark: number, alpha: number, shadow: boolean): void {
  g.save(); g.globalAlpha = clamp(alpha, 0, 1);
  if (shadow) { g.fillStyle = 'rgba(30,25,20,.22)'; g.fillRect(X-4, Y-1, 9, 2); }
  const fx = (f % 4) * FW, fy = ((f/4)|0) * FH;
  const put = (img: CanvasImageSource) => { if (a.flip) { g.save(); g.translate(X + 8, Y - 23); g.scale(-1, 1); g.drawImage(img, fx, fy, FW, FH, 0, 0, FW, FH); g.restore(); } else g.drawImage(img, fx, fy, FW, FH, X - 8, Y - 23, FW, FH); };
  put(a.sheet);
  if (dark > 0.01) { g.globalAlpha = clamp(alpha, 0, 1) * dark; put(darkOf(a.sheet)); }
  g.restore();
}
function drawActor(g: CanvasRenderingContext2D, a: Actor): void {
  const [sx,sy] = iso(a.x, a.y); a.sx = sx; a.sy = sy; a.bx = sx; a.by = sy + E.CF.dy;
  const f = a.walking ? Math.floor(a.walkT*8) % 4 : a.pose.f;
  a.frame = f;
  const dark = 1 - regionAt(a.x, a.y).lit;
  a.dark = dark;
  const seated = !a.walking && (a.dest.type === 'desk' || a.dest.type === 'lounge' || a.dest.type === 'meet' || a.dest.type === 'ceodesk');
  drawSheet(g, a, Math.round(sx), Math.round(sy), f, dark, a.alpha, !seated);
}
function drawFx(g: CanvasRenderingContext2D, a: Actor): void {
  if (a.wait > 0 || a.alpha < 0.5) return;
  const X = Math.round(a.sx), Y = Math.round(a.sy), f = a.frame ?? 10, top = Y - HEAD[f];
  if (E.sel === a.id) { g.fillStyle = '#f0b445'; g.fillRect(X-2, top-7, 5, 1); g.fillRect(X-1, top-6, 3, 1); g.fillRect(X, top-5, 1, 1); }
  if (a.walking) return;
  const fx = a.pose.fx, c = E.clock + a.phase*3, al = 1 - 0.55*(a.dark || 0);
  if (fx === 'water') {   // 물뿌리개(초록)와 화분으로 떨어지는 물방울
    g.fillStyle = '#4f9e58'; g.fillRect(X + 5, top + 11, 4, 3); g.fillStyle = '#3f8a4b'; g.fillRect(X + 5, top + 13, 4, 1);
    g.fillStyle = '#4f9e58'; g.fillRect(X + 9, top + 10, 1, 1); g.fillRect(X + 10, top + 9, 1, 1); g.fillRect(X + 6, top + 10, 2, 1);
    for (let i = 0; i < 3; i++) { const ph = (c*1.6 + i/3) % 1; g.fillStyle = `rgba(96,186,236,${(1 - ph)*al})`; g.fillRect(X + 11 + (i % 2), top + 10 + Math.round(ph*7), 1, 2); }
    return;
  }
  if (fx === 'steam2') { for (let i = 0; i < 3; i++) { const ph = (c*0.9 + i/3) % 1; g.fillStyle = `rgba(150,165,185,${0.9*(1-ph)*al})`; g.fillRect(X + 4 + Math.round(Math.sin(ph*6 + i)), top + 8 - Math.round(ph*6), 1, 1); } return; }
  if (fx === 'sweat' || fx === 'sweat2') { drop(g, X+5, top+2, (c*1.4) % 1, al); if (fx === 'sweat2') drop(g, X-6, top+3, (c*1.4 + 0.5) % 1, al); }
  else if (fx === 'stars') { g.save(); g.globalAlpha = al; for (let i = 0; i < 3; i++) { const an = c*2.2 + i*2.094; star(g, X + Math.cos(an)*11, top + Math.sin(an)*5, ((c*5 + i)|0) % 3 === 0); } g.restore(); }
  else if (fx === 'steam') { for (let i = 0; i < 3; i++) { const ph = (c*0.9 + i/3) % 1; g.fillStyle = `rgba(150,165,185,${0.9*(1-ph)*al})`; g.fillRect(X + 5 + Math.round(Math.sin(ph*6 + i)), Y - 16 - Math.round(ph*7), 1, 1); } }
  else if (fx === 'zzz') { const p1 = (c*0.5) % 1, p2 = (c*0.5 + 0.5) % 1, zc = a.dark > 0.5 ? '170,190,240' : '60,80,130';
    glyph(g, X + 5 + Math.round(p1*3), top - 3 - Math.round(p1*8), Z4, `rgba(${zc},${1-p1})`);
    glyph(g, X + 5 + Math.round(p2*3), top - 3 - Math.round(p2*8), Z5, `rgba(${zc},${1-p2})`); }
}
function deskState(z: TeamZone, i: number): DeskState {
  const owner = z.owners[i]; if (!owner) return 'off';
  const a = E.actors.get(owner);
  const coming = a && a.dest.type === 'desk' && a.dest.zone === z && a.dest.slot === i;
  if (E.DATA && E.DATA.pq.has(owner) && !coming) return 'away';
  if (a && a.dest.type === 'lounge') return 'break';
  if (a && a.dest.type === 'meet') return 'meet';
  return 'on';
}
/* 그리기 순서(층마다): 바닥·벽(drawBase) → 벽 간판·바닥 글씨 → 가구와 사람(drawObjects) → 대표실 문패
   모든 층을 그린 뒤 맨 앞에 유리 승강로, 마지막에 말풍선(drawOverlay) */
const smoothFor = (kz: number) => kz < 1.9;
function drawBase(g: CanvasRenderingContext2D, f: Floor): void {
  g.drawImage(f.BGC!, 0, 0, E.W0, E.FH0);
  const dark = darkOverlay(f);
  if (dark) g.drawImage(dark, 0, 0, E.W0, E.FH0);
  const dl = dq(1 - f.L.common.lit), o = Math.round(f.door*10);
  sprite(g, `ld:${o}:${E.DOORY}:${dl}`, c => drawLandingDoor(c, o/10, dl/20));
}
/* 가구는 미리 그린 도트 그림(sprite)을, 사람은 도트 시트를 앞뒤 순서대로 붙인다. 명패 글씨만 같은 순서 안에서 화면 해상도로 쓴다 */
function drawObjects(g: CanvasRenderingContext2D): void {
  const view = E.view, CF = E.CF;
  g.setTransform(view.kz, 0, 0, view.kz, view.ox, view.oy);
  g.imageSmoothingEnabled = smoothFor(view.kz);
  const items: { k: number; f: () => void }[] = [], here = allPeople().filter(a => a.floor === CF && !a.ride && a.wait <= 0);
  for (const z of E.zones) {
    const d = 1 - z.light.lit;
    if (z.kind === 'lounge') { items.push(...loungeItems(g, z, d)); continue; }
    if (z.kind === 'meet') {
      z.seats.forEach((st, i) => {
        const dl = dq(d), pos = st.dx.toFixed(2) + ',' + st.dy.toFixed(2);
        items.push({ k: st.dx + st.dy - 0.85, f: () => sprite(g, `ch${pos}:${dl}`, c => drawChair(c, st.dx, st.dy, dl/20)) });
        items.push({ k: st.dx + st.dy, f: () => {
          const occ = [...z.seatOf.entries()].find(([, k]) => k === i)?.[0], a = occ && E.actors.get(occ);
          const on = !!(a && !a.ride && a.dest.type === 'meet' && a.dest.slot === i);
          sprite(g, `mt${pos}:${on ? 1 : 0}:${dl}`, c => drawMeetTable(c, st.dx, st.dy, on, dl/20));
        } });
      });
      items.push({ k: z.x0 + 0.4 + z.y0 + 1.1, f: () => { const dl = dq(d); sprite(g, `wb${z.x0.toFixed(2)},${z.y0.toFixed(2)}:${dl}`, c => drawEasel(c, z.x0 + 0.15, z.y0 + 0.75, dl/20)); } });
      continue;
    }
    z.slots.forEach(([dx,dy], i) => {
      const dl = dq(d), pos = dx.toFixed(2) + ',' + dy.toFixed(2);
      items.push({ k: dx + dy - 0.85, f: () => sprite(g, `ch${pos}:${dl}`, c => drawChair(c, dx, dy, dl/20)) });
      items.push({ k: dx + dy, f: () => {
        const st = deskState(z, i), id = z.owners[i], kind = id ? plateKind(id, st) : '';
        sprite(g, `dk${pos}:${st}:${kind}:${dl}`, c => { drawDesk(c, dx, dy, st, dl/20); if (kind) drawPlate(c, dx, dy, kind, dl/20); });
        if (id && kind) drawPlateText(g, dx, dy, id, kind, d);
      } });
    });
  }
  for (const w of CF.walls) {
    const dl = dq(1 - w.l.lit), c = (w.d === 'h' ? w.y : w.x).toFixed(2);
    for (let t = w.a; t < w.b - 1e-6; t += 0.4) {
      const e = Math.min(t + 0.4, w.b), key = `pw${w.d}${c},${t.toFixed(2)},${e.toFixed(2)}:${dl}`;
      if (w.d === 'h') items.push({ k: (t + e)/2 + w.y + 0.07, f: () => sprite(g, key, cg => box(cg, t, w.y - 0.07, e - t, 0.14, 0, PART_H, PART, dl/20)) });
      else items.push({ k: w.x + 0.07 + (t + e)/2, f: () => sprite(g, key, cg => box(cg, w.x - 0.07, t, 0.14, e - t, 0, PART_H, PART, dl/20)) });
    }
  }
  if (CF.ceo) {
    // 대표실: 뒤쪽(책장·의자) → 대표(나) → 앞쪽(책상·유리벽). 하루가 끝나면 대표도 자리를 비운다
    const dl = dq(1 - E.L.ceo!.lit), { x1, y1, door0, door1 } = CEO;
    items.push({ k:1.0, f: () => sprite(g, `ceoB:${dl}`, c => drawCeo(c, dl/20)) });
    items.push({ k:2.4 + 2.22, f: () => sprite(g, `ceoD:${dl}`, c => drawCeoDesk(c, dl/20)) });
    for (let t = 0; t < y1 - 1e-6; t += 0.4) { const e = Math.min(t + 0.4, y1), tt = t; items.push({ k: x1 + 0.05 + (tt + e)/2, f: () => sprite(g, `ceoGX${tt.toFixed(1)}:${dl}`, c => drawCeoGlassX(c, tt, e, dl/20)) }); }
    for (const [a0, b0] of [[0, door0 - 0.1], [door1 + 0.1, x1]]) for (let t = a0; t < b0 - 1e-6; t += 0.4) { const e = Math.min(t + 0.4, b0), tt = t; items.push({ k: (tt + e)/2 + y1 + 0.05, f: () => sprite(g, `ceoGY${tt.toFixed(2)}:${dl}`, c => drawCeoGlassY(c, tt, e, dl/20)) }); }
    const ceoA = E.ceoA;
    const open = !!(ceoA && ceoA.floor === CF && !ceoA.ride && Math.hypot(ceoA.x - CEO_DOOR[0], ceoA.y - CEO_DOOR[1]) < 0.95);
    CF.ceoDoorOpen = open;
    items.push({ k: (door0 + door1)/2 + y1 + 0.05, f: () => sprite(g, `ceoDoor${open ? 1 : 0}:${dl}`, c => drawCeoDoor(c, dl/20, open)) });
  }
  for (const a of here) items.push({ k: a.x + a.y, f: () => drawActor(g, a) });
  items.sort((p,q) => p.k - q.k);
  for (const it of items) it.f();
  for (const a of here) drawFx(g, a);
  g.globalCompositeOperation = 'lighter';
  for (const a of here) {
    if (a.walking || !a.want || a.dest.type !== 'desk' || (a.dark || 0) < 0.05 || !a.want.s) continue;
    if (a.want.s.state === 'idle') continue;
    const [dx,dy] = a.dest.zone.slots[a.dest.slot], [lx,ly] = iso(dx + 0.37, dy - 0.2, 16);
    const gr = g.createRadialGradient(lx, ly, 1, lx, ly, 18);
    gr.addColorStop(0, `rgba(130,175,255,${0.5*a.dark})`); gr.addColorStop(1, 'rgba(130,175,255,0)');
    g.fillStyle = gr; g.fillRect(lx-18, ly-18, 36, 36);
  }
  g.globalCompositeOperation = 'source-over';
}
/* 층 간판(왼쪽 벽)과 대표실 문패 */
function drawFloorSign(f: Floor): void {
  const [s0, s1] = signY(f), cdA = 1 - 0.6*(1 - f.L.common.lit), [px, py] = iso(0, (s0 + s1)/2, 26.5);
  planeText('L', px, py, f.ceo ? 'AI 세션 사옥' : `${f.num}F ${f.name}`, { font:F_DISPLAY, size:10, color:'#f4efe2', max:(s1 - s0 - 0.4)*17.9, alpha:cdA });
  const [qx, qy] = iso(0, E.DOORY, 37.3);
  planeText('L', qx, qy, `${f.num}F`, { font:F_DISPLAY, size:5.5, color:'#f0b445', alpha:cdA });
}
function drawCeoPlaque(f: Floor): void {
  if (!f.ceo || f.ceoDoorOpen) return;
  const [px,py] = iso((CEO.door0 + CEO.door1)/2, CEO.y1, 28.5);
  planeText('R', px, py, '대표실', { font:F_DISPLAY, size:4.6, color:'#3b2410', max:10.5, exact:true, alpha: 1 - 0.6*(1 - f.L.ceo!.lit) });
}
function drawFloorLabels(): void {
  const DATA = E.DATA;
  for (const z of E.zones) {
    const zd = 1 - z.light.lit, [px,py] = iso(z.x0 + 0.45, z.y1 - 0.55);
    let label = z.name;
    if (DATA && z.kind === 'meet') { const ps = z.pid && DATA.smap.get(z.pid); label += ps ? ` · ${trunc(ps.name, 9)}` : ' · 비어 있음'; }
    planeText('F', px, py, label, { font:F_DISPLAY, size:7.5, color: z.kind === 'team' ? shade(z.color, -.18) : z.kind === 'meet' ? '#5e7184' : '#8a7457', align:'left', max:(z.x1 - z.x0 - 1.0)*16, alpha: (zd > 0.5 ? 0.35 : 0.95) });
  }
}
function drawOverlay(): void {
  const view = E.view, DATA = E.DATA, sel = E.sel, clock = E.clock, ctx = E.ctx, actors = E.actors;
  const K = view.kz, U = view.u, T = (bx: number, by: number) => [bx*K + view.ox, by*K + view.oy];
  if (!DATA) return;
  const shown = (a: Actor) => a.wait <= 0 && (a.ride ? (a.rideAl ?? 0) > 0.4 : !!a.floor);
  if (sel) {
    const ss = DATA.smap.get(sel), root = ss ? (ss.parent || ss.id) : null, kids = root ? (DATA.subsOf.get(root) || []) : [];
    const ra = root && actors.get(root);
    if (ra && kids.length && shown(ra)) {
      ctx.save(); ctx.setLineDash([4*U, 4*U]); ctx.strokeStyle = 'rgba(240,180,69,.9)'; ctx.lineWidth = 2*U;
      const [x0, y0] = T(ra.bx, ra.by - HEAD[ra.frame ?? 10] + 4);
      for (const id of kids) { const b = actors.get(id); if (!b || !shown(b) || b.alpha < 0.4) continue; const [x1, y1] = T(b.bx, b.by - HEAD[b.frame ?? 10] + 4); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
      ctx.restore();
    }
    const a = actors.get(sel); if (a && shown(a) && a.want && a.want.s) { const [x,y] = T(a.bx, a.by + 4); pill(x, y, trunc(a.want.s.name, 12), { sel:true }); }
  }
  for (const a of actors.values()) {
    const w = a.want;
    if (a.walking || a.ride || a.wait > 0 || !w || w.type !== 'queue' || a.dest.type !== 'queue' || !w.q || a.floor !== a.dest.floor) continue;
    if (a.bubble && clock < a.bubble.until) continue;
    const m = minsSince(w.q.askedAt), [x,y] = T(a.bx, a.by - HEAD[a.frame ?? 10] - 3);
    if (w.idx === 0) bubble(x, y, `${fmtMin(m)} 대기 · ${trunc(w.q.text, 20)}`, true);
    else pill(x, y - 6*U, fmtMin(m), { bg: m >= 8 ? 'rgba(150,60,40,.85)' : 'rgba(26,30,28,.78)', sel: sel === a.id });
  }
  for (const a of actors.values()) {
    if (a.walking || a.ride || a.wait > 0 || a.dest.type !== 'wait' || a.floor !== a.dest.floor || (a.bubble && clock < a.bubble.until)) continue;
    const [x,y] = T(a.bx, a.by - HEAD[10] - 3); pill(x, y - 6*U, '자리 대기', { bg:'rgba(160,105,10,.88)' });
  }
  if (E.queueOverflow > 0) { const top = E.FLOORS.get(CEO_ID)!, [bx,by] = iso(QX + QMAX*QSTEP + 0.2, QY + 0.4); const [x,y] = T(bx, by + top.dy); pill(x, y, `+${E.queueOverflow}명 더 대기`, { size:11, bg:'rgba(100,70,160,.85)' }); }
  for (const a of allPeople()) {
    if (!a.bubble || clock >= a.bubble.until || !shown(a) || a.alpha < 0.4) continue;
    const [x,y] = T(a.bx, a.by - HEAD[a.frame ?? 1] - 3);
    bubble(x, y, a.bubble.text, false);
  }
  if (E.growNote && clock < E.growNote.until) pill(E.cv.width/2, 16*U, E.growNote.text, { size:12.5, bg:'rgba(42,127,78,.92)' });
}
export function render(): void {
  if (!E.BG) return;
  const view = E.view, ctx = E.ctx, cv = E.cv;
  camApply();
  const tween = E.tween;
  if (tween) {
    const e = (performance.now() - tween.t0) / E.TWEEN_MS;
    if (e >= 1) E.tween = null;
    else {
      const t = e*e*(3 - 2*e), U = view.u, a1 = view.kz / U, x1 = view.ox / U, y1 = view.oy / U;
      view.kz = (tween.a + (a1 - tween.a)*t) * U; view.ox = (tween.bx + (x1 - tween.bx)*t) * U; view.oy = (tween.by + (y1 - tween.by)*t) * U;
    }
  }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#20262a'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = smoothFor(view.kz);
  const oy0 = view.oy;
  // 승강로는 모든 층 뒤에 있으니 먼저 그린다
  useFloor(E.FL[0]);
  ctx.setTransform(view.kz, 0, 0, view.kz, view.ox, view.oy);
  drawShaft(ctx);
  drawShaftLabels();
  for (const f of E.FL) {
    const top = (f.dy) * view.kz + oy0, bot = (f.dy + E.FH0) * view.kz + oy0;
    if (bot < 0 || top > cv.height) continue;          // 화면 밖 층은 건너뛴다
    useFloor(f);
    view.oy = oy0 + f.dy * view.kz;
    ctx.setTransform(view.kz, 0, 0, view.kz, view.ox, view.oy);
    drawBase(ctx, f);
    drawFloorSign(f);
    drawFloorLabels();
    drawObjects(ctx);
    drawCeoPlaque(f);
  }
  view.oy = oy0;
  ctx.setTransform(1,0,0,1,0,0);
  drawOverlay();
}
