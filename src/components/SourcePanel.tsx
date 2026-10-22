// 자료 연결: 예시 시뮬레이션과 앱에서 보내는 실제 상태 사이를 고른다. 아래 버튼은 예시에서만 쓴다
import type { SourceMode } from '../engine/types';
import { useOffice, useOfficeApi } from '../office';

export function SourcePanel() {
  const office = useOfficeApi();
  const src = useOffice(s => s.source);
  const capNote = useOffice(s => s.board.capNote);
  const sim = src.mode === 'sim';

  return (
    <div className="card">
      <h2>자료 연결</h2>
      <div className="row">
        <label htmlFor="src">상태 자료</label>
        <select id="src" value={src.mode} onChange={e => office?.setSource(e.target.value as SourceMode)}>
          <option value="sim">예시 시뮬레이션 (1초에 1분)</option>
          <option value="push">앱에서 보내기 (Tauri 이벤트)</option>
        </select>
      </div>
      <p className="note">{src.note}</p>
      <div className="btns">
        <button type="button" className="btn" disabled={!sim} onClick={() => office?.sim.addSub()}>하위 작업자 추가</button>
        <button type="button" className="btn" disabled={!sim} onClick={() => office?.sim.addQuestion()}>질문 추가</button>
        <button type="button" className="btn" disabled={!sim} onClick={() => office?.sim.addGroupWork()}>새 팀 시작</button>
        <button type="button" className="btn" disabled={!sim} onClick={() => office?.sim.addProject()}>새 프로젝트 시작</button>
        <button type="button" className="btn" disabled={!sim} aria-pressed={sim && src.simCut} onClick={() => office?.sim.toggleCut()}>
          {sim && src.simCut ? '자료 다시 연결' : '자료 끊기'}
        </button>
        <button type="button" className="btn" disabled={!sim} onClick={() => office?.sim.toggleDay()}>
          {sim && src.simClosing ? '새 하루 시작' : '하루 마감'}
        </button>
        <button type="button" className="btn" onClick={() => office?.ceoTour()}>대표 순회</button>
      </div>
      <p className="note">{capNote}</p>
    </div>
  );
}
