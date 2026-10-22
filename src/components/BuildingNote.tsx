// 오늘 건물 규모(층·책상·소파 수)와 자리가 늘어나는 규칙
import { useOffice } from '../office';

export function BuildingNote() {
  const capNote = useOffice(s => s.board.capNote);
  if (!capNote) return null;
  return (
    <div className="card">
      <h2>오늘 건물</h2>
      <p className="note">{capNote}</p>
    </div>
  );
}
