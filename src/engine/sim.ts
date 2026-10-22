/* ── 예시 시뮬레이션 (실제 세션 아님) ── */
import type { SessionState, StatusJson } from './types';

interface SimSession {
  id: string; name: string; project: string | null; group: string; parent: string | null;
  state: SessionState; startedAt: string; stateSince: string; _life: number;
}
interface SimQuestion { id: string; sessionId: string; text: string; askedAt: string }
interface SimState { t: number; seq: number; cut: boolean; ending: boolean; dayEnded: boolean; sessions: SimSession[]; questions: SimQuestion[] }
type Proj = { id: string; name: string };
type Group = { id: string; name: string; project: string };

export interface Sim {
  tick(): void;
  snapshot(): StatusJson;
  addSub(): boolean;
  addQuestion(): boolean;
  addGroupWork(): boolean;
  addProject(): boolean;
  cut: boolean;
  readonly closing: boolean;
  endDay(): void;
  newDay(): void;
}

export function createSim(): Sim {
  const M = 60000, R = Math.random;
  const BASE_PROJECTS: Proj[] = [{ id:'web', name:'웹 리뉴얼' }, { id:'blog', name:'기술 블로그' }];
  const BASE_GROUPS: Group[] = [{ id:'fe', name:'프론트엔드', project:'web' }, { id:'be', name:'백엔드 API', project:'web' }, { id:'doc', name:'문서·블로그', project:'blog' }];
  // 있는 층에 새로 생기는 팀
  const EXTRA = [{ id:'qa', name:'테스트', project:'web', work:['회귀 테스트 실행','결제 흐름 점검','모바일 화면 확인'] },
    { id:'seo', name:'검색 노출', project:'blog', work:['메타 태그 점검','사이트맵 갱신','글 제목 다듬기'] },
    { id:'design', name:'디자인 QA', project:'web', work:['버튼 간격 검수','다크 모드 색 점검','아이콘 정렬 확인'] }];
  // 새로 생기는 프로젝트(층)
  const EXTRA_PROJECTS = [{ id:'metrics', name:'지표 대시보드', team:{ id:'data', name:'데이터 분석', work:['주간 지표 정리','이탈 원인 쿼리','대시보드 수치 검증'] } },
    { id:'ops', name:'운영 자동화', team:{ id:'infra', name:'인프라', work:['배포 파이프라인 점검','로그 보관 기간 조정','비용 알림 설정'] } },
    { id:'app', name:'모바일 앱', team:{ id:'appui', name:'앱 화면', work:['알림 설정 화면','온보딩 개선','앱 아이콘 교체'] } }];
  let PROJECTS = BASE_PROJECTS.slice(), GROUPS = BASE_GROUPS.slice();
  const SUBS = ['테스트 케이스 작성','타입 오류 정리','로그 수집','스크린샷 비교','의존성 조사','깨진 링크 점검','쿼리 성능 측정','번역 검수','접근성 검사','캐시 무효화 확인'];
  const QS = ['이 컴포넌트 이름을 바꿔도 될까요?','테스트 2개가 불안정합니다. 건너뛸까요?','릴리스 노트에 내부 지표를 넣을까요?','새 라이브러리를 추가해도 될까요?',
    'API 응답 형식이 바뀌면 앱도 고쳐야 합니다. 진행할까요?','디자인 시안과 다른 부분이 있습니다. 어느 쪽을 따를까요?','배포는 오늘 할까요, 내일 아침에 할까요?','오래된 설정 파일을 지워도 될까요?'];
  const toIso = (ms: number) => new Date(ms).toISOString();
  const pick = <T,>(a: T[]): T => a[Math.floor(R()*a.length)];
  const projOf = (gid: string) => GROUPS.find(g => g.id === gid)?.project || null;
  let S: SimState = null as unknown as SimState, nid = 101, qn = 1;
  function seed(base: number){
    S = { t:base, seq:0, cut:false, ending:false, dayEnded:false, sessions:[], questions:[] };
    PROJECTS = BASE_PROJECTS.slice(); GROUPS = BASE_GROUPS.slice();
    const add = (g: string, name: string, state: SessionState, run: number, since?: number, parent?: string) => { const id = 's-' + (nid++); S.sessions.push({ id, name, project:projOf(g), group:g, parent:parent || null, state, startedAt:toIso(S.t - run*M), stateSince:toIso(S.t - (since ?? run)*M), _life: 4 + Math.floor(R()*7) }); return id; };
    const a = add('fe','대시보드 차트 리팩터','working',12);
    add('fe','로그인 화면 접근성 점검','working',46);
    add('fe','번들 크기 분석','idle',30,6);
    const w = add('be','결제 웹훅 재시도','blocked',28,15);
    add('be','API 문서 생성','reporting',20,1);
    const db = add('be','DB 마이그레이션 검토','working',9);
    add('doc','릴리스 노트 작성','working',15);
    add('doc','블로그 글 교정','idle',50,22);
    add('fe','차트 색상 토큰 정리','working',3,3,a);
    S.questions.push({ id:'q-' + (qn++), sessionId:w, text:'재시도 간격을 지수 백오프로 바꿔도 될까요?', askedAt:toIso(S.t - 11*M) });
    S.questions.push({ id:'q-' + (qn++), sessionId:db, text:'운영 DB에 바로 적용할까요, 스테이징 먼저 할까요?', askedAt:toIso(S.t - 4*M) });
  }
  const setState = (s: SimSession, st: SessionState) => { s.state = st; s.stateSince = toIso(S.t); };
  const asking = (id: string) => S.questions.some(q => q.sessionId === id);
  function removeSession(id: string){ S.sessions = S.sessions.filter(s => s.id !== id); S.questions = S.questions.filter(q => q.sessionId !== id); }
  function ask(s: SimSession, text?: string){ S.questions.push({ id:'q-' + (qn++), sessionId:s.id, text: text || pick(QS), askedAt:toIso(S.t) }); }
  function addSub(){
    if (S.dayEnded || S.ending) return false;
    const parents = S.sessions.filter(s => !s.parent && s.state === 'working' && !asking(s.id));
    if (!parents.length || S.sessions.filter(s => s.parent).length >= 6) return false;
    const p = pick(parents);
    S.sessions.push({ id:'s-' + (nid++), name:pick(SUBS), project:p.project, group:p.group, parent:p.id, state:'working', startedAt:toIso(S.t), stateSince:toIso(S.t), _life: 4 + Math.floor(R()*7) });
    return true;
  }
  function addGroupWork(){
    if (S.dayEnded || S.ending) return false;
    const g = EXTRA.find(e => !GROUPS.some(x => x.id === e.id) && PROJECTS.some(p => p.id === e.project));
    if (!g) return false;
    GROUPS.push({ id:g.id, name:g.name, project:g.project });
    S.sessions.push({ id:'s-' + (nid++), name:pick(g.work), project:g.project, group:g.id, parent:null, state:'working', startedAt:toIso(S.t), stateSince:toIso(S.t), _life:0 });
    return true;
  }
  function addProject(){
    if (S.dayEnded || S.ending) return false;
    const p = EXTRA_PROJECTS.find(e => !PROJECTS.some(x => x.id === e.id));
    if (!p) return false;
    PROJECTS.push({ id:p.id, name:p.name }); GROUPS.push({ id:p.team.id, name:p.team.name, project:p.id });
    for (let i = 0; i < 2; i++) S.sessions.push({ id:'s-' + (nid++), name:p.team.work[i], project:p.id, group:p.team.id, parent:null, state:'working', startedAt:toIso(S.t), stateSince:toIso(S.t), _life:0 });
    return true;
  }
  function addQuestion(){
    if (S.dayEnded || S.ending) return false;
    const c = S.sessions.filter(s => !s.parent && !asking(s.id));
    if (!c.length) return false;
    ask(pick(c)); return true;
  }
  function tick(){
    S.t += M; S.seq++;
    if (S.dayEnded) return;
    const now = S.t;
    if (S.ending) {
      const subs = S.sessions.filter(s => s.parent), pool = subs.length ? subs : S.sessions;
      pool.slice(0, Math.min(pool.length, R() < .5 ? 2 : 1)).map(s => s.id).forEach(removeSession);
      if (!S.sessions.length) { S.dayEnded = true; S.ending = false; }
      return;
    }
    for (const s of [...S.sessions]) {
      if (asking(s.id)) continue;
      const r = R(), since = (now - Date.parse(s.stateSince)) / M, run = (now - Date.parse(s.startedAt)) / M;
      if (s.state === 'working') {
        if (s.parent && run >= s._life) setState(s, 'reporting');
        else if (r < .045) setState(s, 'reporting');
        else if (r < .07) setState(s, 'blocked');
        else if (r < .092 && !s.parent) ask(s);
      } else if (s.state === 'reporting') {
        if (since >= 2) { if (s.parent) removeSession(s.id); else setState(s, 'idle'); }
      } else if (s.state === 'idle') {
        if (r < .07) { s.state = 'working'; s.startedAt = toIso(now); s.stateSince = toIso(now); }
      } else if (s.state === 'blocked') {
        if (r < .12) setState(s, 'working');
      }
    }
    for (const q of [...S.questions]) {
      const age = (now - Date.parse(q.askedAt)) / M;
      if (age >= 2 && R() < .07) {
        S.questions = S.questions.filter(x => x !== q);
        const s = S.sessions.find(x => x.id === q.sessionId);
        if (s && !asking(s.id)) setState(s, 'working');
      }
    }
    if (R() < .08) addSub();
  }
  function snapshot(): StatusJson {
    return { updatedAt:toIso(S.t), seq:S.seq, dayEnded:S.dayEnded, projects:PROJECTS, groups:GROUPS,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      sessions:S.sessions.map(({ _life, ...s }) => s), questions:S.questions.map(q => ({ ...q })) };
  }
  const today = new Date(); today.setHours(8, 30, 0, 0);
  seed(today.getTime());
  return {
    tick, snapshot, addSub, addQuestion, addGroupWork, addProject,
    get cut(){ return S.cut; }, set cut(v: boolean){ S.cut = v; },
    get closing(){ return S.ending || S.dayEnded; },
    endDay(){ if (!S.dayEnded) S.ending = true; },
    newDay(){ const d = new Date(S.t); d.setDate(d.getDate() + 1); d.setHours(8, 30, 0, 0); const cut = S.cut; seed(d.getTime()); S.cut = cut; }
  };
}
