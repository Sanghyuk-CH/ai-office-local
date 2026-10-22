/* 사옥 엔진 입구. createOffice가 인스턴스 하나를 만들고, 프레임·관찰자·이벤트를 모두 걸고 destroy에서 거둔다. */
import { isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { buildLayout } from './building';
import { allPeople, ceoTour } from './ceo';
import { resize, screenToBase, syncZoomUi, zoomAt, zoomCenter, zoomFit, zoomFloor, ZMIN } from './camera';
import { capStore, parseSavedCap } from './capStore';
import { ASSETS, HEAD, POLL_MS, STALE_MS, TAURI_EVENT } from './constants';
import { ingest, poll, resetSource } from './data';
import { render } from './draw';
import type { Actor } from './model';
import { createSim } from './sim';
import { bind, createCtx, type Ctx } from './state';
import type { Office, SourceMode, StatusJson } from './types';
import { flush, hideTip, renderBoard, select, showTip, syncDemo, syncLamps, updateStatus } from './ui';
import { update } from './update';

export type * from './types';

declare global {
  interface Window { aiOffice?: { push(state: StatusJson | string): void } }
}

function loadImg(src: string | null): Promise<HTMLImageElement | null> {
  return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

export function createOffice(canvas: HTMLCanvasElement, stage: HTMLElement): Office {
  let tauri = false;
  try { tauri = isTauri(); } catch { tauri = false; }
  const C: Ctx = createCtx(canvas, stage, createSim(), tauri);
  const cv = canvas;
  let destroyed = false, raf = 0, timer: ReturnType<typeof setInterval> | null = null, unlisten: UnlistenFn | null = null;
  const cleanups: (() => void)[] = [];
  /** 엔진에 들어오는 입구: 이 인스턴스를 가리키고 실행 */
  const run = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R => { bind(C); return fn(...a); };
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    const h = run(fn) as (e: Event) => void;
    el.addEventListener(type, h, opts);
    cleanups.push(() => el.removeEventListener(type, h, opts));
  };

  /* ── 프레임 ── */
  const frame = run((t: number) => {
    if (destroyed) return;
    const dt = Math.min(0.1, (t - C.lastT) / 1000); C.lastT = t;
    C.frozen = !C.hasData || (t - C.lastFresh > STALE_MS);
    if (!C.frozen) { C.clock += dt; update(dt); }
    syncLamps();
    render();
    updateStatus(t);
    flush();
    raf = requestAnimationFrame(frame);
  });

  const ro = new ResizeObserver(run(() => resize()));
  ro.observe(stage);
  cleanups.push(() => ro.disconnect());

  /* ── 마우스를 올리면 설명 ── */
  function hitActor(ev: MouseEvent): Actor | null {
    const [bx, by] = screenToBase(ev.clientX, ev.clientY);
    let best: Actor | null = null, bd = 1e9;
    for (const a of allPeople()) {
      if (a.wait > 0 || a.alpha < 0.5 || (a.ride ? (a.rideAl ?? 0) < 0.4 : !a.floor)) continue;
      const top = a.by - HEAD[a.frame ?? 10] - 1;
      if (Math.abs(bx - a.bx) <= 7 && by >= top && by <= a.by + 2) { const d = Math.abs(bx - a.bx) + Math.abs(by - (a.by - 10)); if (d < bd) { bd = d; best = a; } }
    }
    return best;
  }
  on(cv, 'mousemove', ev => {
    if (C.ptrs.size) return;
    const a = hitActor(ev);
    cv.style.cursor = a ? 'pointer' : 'default';
    if (!a) return hideTip();
    const sr = stage.getBoundingClientRect();
    showTip(a, ev.clientX - sr.left, ev.clientY - sr.top);
  });
  on(cv, 'mouseleave', () => hideTip());
  on(cv, 'click', ev => { if (C.dragMoved) return; const a = hitActor(ev); if (a && !a.isCeo) select(a.id); });

  /* ── 확대·이동 ── */
  on(cv, 'wheel', e => {
    if (e.deltaY > 0 && C.cam.zoom <= ZMIN + 1e-3) return;      // 다 줄인 상태에서 더 내리면 페이지가 스크롤된다
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.0015));
  }, { passive:false });
  on(cv, 'pointerdown', e => {
    if (e.button && e.button !== 0) return;
    C.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
    try { cv.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    if (C.ptrs.size === 1) { C.dragMoved = false; C.downAt = { x:e.clientX, y:e.clientY }; }
    if (C.ptrs.size === 2) { const [a, b] = [...C.ptrs.values()]; C.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; C.dragMoved = true; }
  });
  on(cv, 'pointermove', e => {
    const p = C.ptrs.get(e.pointerId); if (!p) return;
    const r = cv.getBoundingClientRect(), toBase = cv.width / r.width / C.view.kz;
    if (C.ptrs.size === 1) {
      const downAt = C.downAt ?? { x:e.clientX, y:e.clientY };
      if (!C.dragMoved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4 && C.cam.zoom > ZMIN + 1e-3) { C.dragMoved = true; C.camAnim = null; cv.classList.add('dragging'); hideTip(); }
      if (C.dragMoved) { C.cam.cx = (C.cam.cx ?? 0) - (e.clientX - p.x) * toBase; C.cam.cy = (C.cam.cy ?? 0) - (e.clientY - p.y) * toBase; }
    }
    p.x = e.clientX; p.y = e.clientY;
    if (C.ptrs.size === 2 && C.pinch) {
      const [a, b] = [...C.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt((a.x + b.x)/2, (a.y + b.y)/2, d / C.pinch.d); C.pinch.d = d;
    }
  });
  let dragTimer: ReturnType<typeof setTimeout> | null = null;
  const endPtr = (e: PointerEvent) => {
    C.ptrs.delete(e.pointerId);
    if (C.ptrs.size < 2) C.pinch = null;
    if (!C.ptrs.size) { cv.classList.remove('dragging'); dragTimer = setTimeout(() => { dragTimer = null; C.dragMoved = false; }, 0); }
  };
  on(cv, 'pointerup', endPtr); on(cv, 'pointercancel', endPtr);
  cleanups.push(() => { if (dragTimer) clearTimeout(dragTimer); });

  /* ── 자료 받기 ── */
  const push = run((state: StatusJson | string) => { if (C.srcMode === 'push') ingest(state); });
  const aiOffice = { push };
  window.aiOffice = aiOffice;   // 디버깅용
  cleanups.push(() => { if (window.aiOffice === aiOffice) delete window.aiOffice; });
  if (tauri) {
    listen<StatusJson | string>(TAURI_EVENT, run(e => { if (!destroyed && C.srcMode === 'push') ingest(e.payload); }))
      .then(u => { if (destroyed) u(); else unlisten = u; })
      .catch(() => { /* 이벤트를 못 받으면 5초 뒤 '확인 중'이 됨 */ });
  }

  /* ── 시작: 저장된 자리 수를 먼저 읽고 나서 자료를 받는다 ── */
  bind(C);
  buildLayout();
  renderBoard(); syncDemo(); syncZoomUi();
  raf = requestAnimationFrame(frame);
  (async () => {
    bind(C);
    const saved = parseSavedCap(capStore.load());
    if (saved) C.cap = saved;
    const img = await loadImg(ASSETS.sprite);
    if (destroyed) return;
    bind(C);
    C.SPRITE_IMG = img;
    if (tauri) { C.srcMode = 'push'; syncDemo(); }
    else ingest(JSON.stringify(C.sim.snapshot()));
    timer = setInterval(run(() => poll()), POLL_MS);
  })();

  const setSource = run((mode: SourceMode) => {
    C.srcMode = mode; resetSource(); syncDemo();
    if (mode === 'sim') ingest(JSON.stringify(C.sim.snapshot()));
  });

  return {
    subscribe(listener) { C.listeners.add(listener); return () => { C.listeners.delete(listener); }; },
    getSnapshot() { return C.snap; },
    push,
    setSource,
    select: run((id: string | null) => select(id)),
    zoomIn: run(() => zoomCenter(1.5)),
    zoomOut: run(() => zoomCenter(1/1.5)),
    zoomFit: run(() => zoomFit()),
    zoomFloor: run((id: string) => zoomFloor(C.FLOORS.get(id))),
    sim: {
      addSub: run(() => { C.sim.addSub(); }),
      addQuestion: run(() => { C.sim.addQuestion(); }),
      addGroupWork: run(() => { C.sim.addGroupWork(); }),
      addProject: run(() => { C.sim.addProject(); }),
      toggleCut: run(() => { C.sim.cut = !C.sim.cut; syncDemo(); }),
      toggleDay: run(() => { if (C.sim.closing) C.sim.newDay(); else C.sim.endDay(); syncDemo(); }),
    },
    ceoTour: run(() => ceoTour()),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
      if (unlisten) { unlisten(); unlisten = null; }
      for (const c of cleanups.splice(0)) c();
      C.listeners.clear();
    },
  };
}
