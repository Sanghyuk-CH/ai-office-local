// 층별 명단: 층마다 팀 카드·휴게실 카드, 맨 위층은 대표실 앞 질문 줄
import type { CSSProperties, KeyboardEvent } from 'react';
import type { FloorSection, Member, QueueItem, ZoneCard } from '../engine/types';
import { useOffice, useOfficeApi } from '../office';
import { AppTag } from './AppTag';

type Pick = (id: string) => void;

function onKeys(pick: Pick, id: string) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); }
  };
}

function MemberRow({ m, selected, pick }: { m: Member; selected: boolean; pick: Pick }) {
  const cls = [selected ? 'sel' : '', m.child ? 'child' : ''].filter(Boolean).join(' ');
  return (
    <li tabIndex={0} className={cls || undefined} onClick={() => pick(m.id)} onKeyDown={onKeys(pick, m.id)}>
      <span className="nm">
        {m.child ? '↳ ' : ''}<AppTag app={m.app} />{m.name}
        {m.sub.length > 0 && <span className="sub">{m.sub.join(' · ')}</span>}
      </span>
      <span className={`chip c-${m.tone}`}>{m.label}</span>
      <span className="time">{m.time}</span>
    </li>
  );
}

function QueueRow({ q, selected, pick }: { q: QueueItem; selected: boolean; pick: Pick }) {
  return (
    <li tabIndex={0} className={selected ? 'sel' : undefined} onClick={() => pick(q.sessionId)} onKeyDown={onKeys(pick, q.sessionId)}>
      <span className="ord">{q.order}</span>
      <span className="nm">
        <AppTag app={q.app} />{q.name}
        {q.fromFloor && <span className="sub">{q.fromFloor}에서 올라옴</span>}
        <span className="qt">{q.text}{q.more > 0 ? ` (질문 ${q.more}건 더)` : ''}</span>
      </span>
      <span className={`chip c-${q.tone}`}>{q.time}</span>
    </li>
  );
}

function Card({ c, selected, pick }: { c: ZoneCard; selected: string | null; pick: Pick }) {
  const queue = c.kind === 'queue';
  const has = queue ? c.queue.length > 0 : c.members.length > 0;
  return (
    <article className={`card zone${queue ? ' queue-card' : ''}${c.dark ? ' dark' : ''}`} style={{ '--zc': c.color } as CSSProperties}>
      {c.kind !== 'loose' && (
        <header><span className="zdot"></span><h3>{c.name}</h3><span className="zmeta">{c.meta}</span></header>
      )}
      {!has ? <p className="empty">{c.empty}</p> : queue ? (
        <ul className="members q">{c.queue.map(q => <QueueRow key={q.sessionId} q={q} selected={selected === q.sessionId} pick={pick} />)}</ul>
      ) : (
        <ul className="members">{c.members.map(m => <MemberRow key={m.id} m={m} selected={selected === m.id} pick={pick} />)}</ul>
      )}
    </article>
  );
}

function Floor({ f, selected, pick, onFloor }: { f: FloorSection; selected: string | null; pick: Pick; onFloor: (id: string) => void }) {
  return (
    <section className={`fsec${f.ceo ? ' ceo' : ''}`}>
      <header className="fhead">
        {f.id !== null && (
          <button type="button" className="fnum" title={`화면에서 ${f.floorName} 보기`} onClick={() => onFloor(f.id!)}>{f.num}F</button>
        )}
        <h2>{f.title}</h2>
        <span className="zmeta">{f.meta}</span>
      </header>
      <div className="board">{f.cards.map(c => <Card key={c.key} c={c} selected={selected} pick={pick} />)}</div>
    </section>
  );
}

export function Board({ onFloor }: { onFloor: () => void }) {
  const office = useOfficeApi();
  const board = useOffice(s => s.board);
  const selected = useOffice(s => s.selected);
  const pick: Pick = id => office?.select(id);
  const goFloor = (id: string) => { office?.zoomFloor(id); onFloor(); };

  return (
    <section className="floors-board" aria-label="층별 명단">
      {!board.ready ? <div className="card empty">첫 자료를 기다리는 중입니다.</div>
        : board.floors.map(f => <Floor key={f.id ?? '_loose'} f={f} selected={selected} pick={pick} onFloor={goFloor} />)}
    </section>
  );
}
