import { useCallback, useRef, useState } from 'react';
import type { Office } from './engine/types';
import { OfficeContext } from './office';
import { Header } from './components/Header';
import { Stats } from './components/Stats';
import { Board } from './components/Board';
import { Stage } from './components/Stage';
import { Legend } from './components/Legend';
import { SourcePanel } from './components/SourcePanel';
import { FormatHelp } from './components/FormatHelp';

export function App() {
  const [office, setOffice] = useState<Office | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const showStage = useCallback(() => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), []);

  return (
    <OfficeContext.Provider value={office}>
      <div className="app">
        <Header />
        <div className="layout">
          <aside className="side side-l" aria-label="현황">
            <Stats />
            <Board onFloor={showStage} />
          </aside>
          <section className="view" aria-label="사옥">
            <Stage ref={stageRef} onReady={setOffice} />
          </section>
          <aside className="side side-r" aria-label="안내와 자료 연결">
            <Legend />
            <SourcePanel />
            <FormatHelp />
          </aside>
        </div>
      </div>
    </OfficeContext.Provider>
  );
}
