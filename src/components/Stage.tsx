// 사옥 캔버스와 그 위에 얹는 것들(층 버튼, 멈춤 안내, 말풍선 설명, 확대 버튼)
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { createOffice } from '../engine';
import type { Office } from '../engine/types';
import { useOffice, useOfficeApi } from '../office';

function Lift() {
  const office = useOfficeApi();
  const buttons = useOffice(s => s.lift);
  return (
    <nav className="lift" aria-label="층 바로가기">
      {buttons.map(b => (
        <button key={b.id} type="button" title={b.title} onClick={() => office?.zoomFloor(b.id)}>
          <b>{b.num}F</b><span>{b.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Stale() {
  const st = useOffice(s => s.status);
  return (
    <div className="stale" hidden={!st.frozen}>
      <span className="bars" aria-hidden="true"><i></i><i></i></span><b>확인 중</b><span>{st.staleText}</span>
    </div>
  );
}

/** 커서 오른쪽 위에 띄우되 무대 밖으로 나가지 않게 */
function Tip({ stage }: { stage: RefObject<HTMLDivElement | null> }) {
  const tip = useOffice(s => s.tip);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current, sr = stage.current?.getBoundingClientRect();
    if (!tip || !el || !sr) return;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const tw = el.offsetWidth, th = el.offsetHeight;
    setPos({ left: clamp(tip.x + 14, 6, sr.width - tw - 6), top: clamp(tip.y - th - 10, 6, sr.height - th - 6) });
  }, [tip, stage]);
  return (
    <div className="tip" ref={ref} hidden={!tip} style={{ left: pos.left, top: pos.top }}>
      {tip && (<>
        <b>{tip.title}</b>
        {tip.lines.map((l, i) => (
          <span key={i}>{i > 0 && <br />}{l.muted ? <span className="t-muted">{l.text}</span> : l.text}</span>
        ))}
      </>)}
    </div>
  );
}

function ZoomControls() {
  const office = useOfficeApi();
  const z = useOffice(s => s.zoom);
  return (
    <div className="zoomctl" role="group" aria-label="확대와 축소">
      <button type="button" aria-label="축소" disabled={!z.canOut} onClick={() => office?.zoomOut()}>−</button>
      <span className="zv">{z.pct}%</span>
      <button type="button" aria-label="확대" disabled={!z.canIn} onClick={() => office?.zoomIn()}>+</button>
      <button type="button" disabled={!z.canFit} onClick={() => office?.zoomFit()}>전체 보기</button>
    </div>
  );
}

export function Stage({ ref: outer, onReady }: { ref?: Ref<HTMLDivElement>; onReady: (o: Office | null) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(outer, () => stage.current!, []);

  useEffect(() => {
    const office = createOffice(canvas.current!, stage.current!);
    onReady(office);
    return () => { onReady(null); office.destroy(); };
  }, [onReady]);

  return (
    <div className="stage" ref={stage}>
      <canvas ref={canvas} role="img" aria-label="사옥 전체 화면"></canvas>
      <Lift />
      <Stale />
      <Tip stage={stage} />
      <ZoomControls />
    </div>
  );
}
