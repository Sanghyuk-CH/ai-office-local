// 엔진 인스턴스를 React에 잇는 곳. 엔진은 Stage가 캔버스를 붙일 때 만들어지고,
// 그 전까지는 INITIAL 조각을 보여 준다.
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Office, UiSnapshot } from './engine/types';

export const INITIAL: UiSnapshot = {
  status: { state: 'checking', text: '확인 중', sub: '첫 자료를 기다리는 중', staleText: '첫 자료를 기다리는 중입니다', frozen: true },
  stats: [],
  board: { ready: false, floors: [], capNote: '' },
  lift: [],
  zoom: { pct: 100, canIn: true, canOut: false, canFit: false },
  tip: null,
  selected: null,
  source: { mode: 'sim', note: '', simCut: false, simClosing: false },
};

export const OfficeContext = createContext<Office | null>(null);

const noop = () => () => {};

/** 엔진 화면 조각 하나를 구독한다. 조각이 같은 참조면 다시 그리지 않는다 */
export function useOffice<T>(pick: (s: UiSnapshot) => T): T {
  const office = useContext(OfficeContext);
  return useSyncExternalStore(office ? office.subscribe : noop, () => pick(office ? office.getSnapshot() : INITIAL));
}

export function useOfficeApi(): Office | null {
  return useContext(OfficeContext);
}
