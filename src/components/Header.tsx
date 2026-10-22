import { useOffice } from '../office';

export function Header() {
  const st = useOffice(s => s.status);
  return (
    <header className="top">
      <div className="brand">
        <h1>AI 세션 사옥</h1>
        <p>실행 중인 AI 세션 하나가 사람 한 명입니다. 프로젝트마다 한 층, 층 안에는 팀마다 책상 섬이 있고, 맨 위층이 대표실입니다. 층을 옮길 때는 유리 엘리베이터를 탑니다.</p>
      </div>
      <div className="status" data-state={st.state} role="status" aria-live="polite">
        <span className="dot"></span><span>{st.text}</span><span className="sub">{st.sub}</span>
      </div>
    </header>
  );
}
