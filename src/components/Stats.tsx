import type { CSSProperties } from 'react';
import { useOffice } from '../office';

export function Stats() {
  const items = useOffice(s => s.stats);
  return (
    <ul className="stats">
      {items.map(it => (
        <li key={it.label} style={it.colorVar ? ({ '--c': `var(${it.colorVar})` } as CSSProperties) : undefined}>
          <b>{it.value}</b>{it.label}
        </li>
      ))}
    </ul>
  );
}
