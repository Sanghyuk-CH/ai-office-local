import type { CSSProperties } from 'react';

const ITEMS: [string, string][] = [
  ['var(--work)', '타자: 작업 중'],
  ['var(--warn)', '땀: 40분 넘음 또는 막힘'],
  ['var(--ok)', '만세와 별: 결과 보고'],
  ['var(--idle)', '휴게실(낮은 벽으로 두른 방) 소파에서 커피, 15분 넘으면 졸음: 대기'],
  ['#5b4796', '책상 명패 색: 보라는 대표실에 감, 청회색은 휴게실에서 쉬는 중'],
  ['#c08a1a', '구역 앞에 서 있음: 책상이 모자라 기다리는 중 (1분 뒤 책상이 늘어남)'],
  ['var(--q)', '대표실 앞 줄(맨 위층): 나에게 온 질문. 엘리베이터를 타고 올라와 줄을 섭니다'],
  ['#9fcde6', '유리 엘리베이터: 층을 옮기거나 출근·퇴근할 때 탑니다'],
  ['#f2c94c', '노란 모자: 하위 작업자(상위 세션과 같은 색 옷). 생기면 팀이 바로 팀 앞 회의 자리로 모이고, 다 끝나면 회의 자리는 치워짐'],
  ['var(--line)', '휠로 확대·축소, 끌어서 이동, 오른쪽 위 층 버튼으로 바로 가기'],
];

export function Legend() {
  return (
    <div className="card">
      <h2>보는 법</h2>
      <ul className="legend" aria-label="몸짓 안내">
        {ITEMS.map(([c, text]) => <li key={text}><i style={{ '--c': c } as CSSProperties}></i>{text}</li>)}
      </ul>
    </div>
  );
}
