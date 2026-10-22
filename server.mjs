#!/usr/bin/env node
// AI 세션 사옥 · 로컬 서버
// 훅이 남긴 기록(~/.ai-office/events/*.jsonl)을 읽어 status.json을 그때그때 만들어 주고, office.html도 함께 내준다.
//   node server.mjs           → http://localhost:4317
//   node server.mjs --clear   → 쌓인 기록을 모두 지우고 끝
// 의존 패키지 없음. Node 18 이상.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.AI_OFFICE_DIR || path.join(os.homedir(), '.ai-office', 'events');
const PORT = Number(process.env.PORT) || 4317;

const MIN = 60_000, HOUR = 60 * MIN;
const REPORT_TO_IDLE = 3 * MIN;   // 결과 보고 뒤 3분 동안 답이 없으면 대기(휴게실)로
const GONE_WORKING = 2 * HOUR;    // 작업 중인데 2시간 동안 아무 사건이 없으면 꺼진 세션으로 본다
const GONE_IDLE = 8 * HOUR;       // 대기 상태로 8시간이 지나도 꺼진 것으로 본다
const SKIP_OLDER = 2 * 24 * HOUR; // 이틀 넘게 손대지 않은 기록 파일은 읽지 않는다

if (process.argv.includes('--clear')) {
  let n = 0;
  if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR)) if (f.endsWith('.jsonl')) { fs.unlinkSync(path.join(DIR, f)); n++; }
  console.log(`기록 ${n}개를 지웠습니다 (${DIR})`);
  process.exit(0);
}

/* ── 기록 읽기: 파일마다 읽은 위치를 기억해 새로 붙은 줄만 읽는다 ── */
const files = new Map();     // 파일 이름 → { off, rest }
const sessions = new Map();  // session_id → 세션 상태

function readNew(){
  if (!fs.existsSync(DIR)) return;
  const now = Date.now();
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.jsonl')) continue;
    const full = path.join(DIR, f);
    let st; try { st = fs.statSync(full); } catch { continue; }
    let rec = files.get(f);
    if (!rec) {
      if (now - st.mtimeMs > SKIP_OLDER) { files.set(f, { off: st.size, rest: '' }); continue; }
      rec = { off: 0, rest: '' }; files.set(f, rec);
    }
    if (st.size < rec.off) { rec.off = 0; rec.rest = ''; sessions.delete(f.slice(0, -6)); } // 파일이 새로 만들어짐
    if (st.size === rec.off) continue;
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.alloc(st.size - rec.off);
    fs.readSync(fd, buf, 0, buf.length, rec.off); fs.closeSync(fd);
    rec.off = st.size;
    const lines = (rec.rest + buf.toString('utf8')).split('\n');
    rec.rest = lines.pop();
    const sid = f.slice(0, -6);
    for (const line of lines) {
      if (!line.trim()) continue;
      try { const o = JSON.parse(line); applyEvent(sid, o); logEvent(sid, o); } catch {}
    }
  }
}

/* ── 사건 → 세션 상태 ── */
const firstLine = (s, n) => { const l = String(s || '').split('\n').map(x => x.trim()).find(Boolean) || ''; return l.length > n ? l.slice(0, n) + '…' : l; };
function permText(o){
  if (o.why) return o.why;
  if (o.tool === 'Bash') return `명령 실행해도 될까요? ${o.cmd || ''}`.trim();
  if (o.tool === 'Edit' || o.tool === 'Write' || o.tool === 'MultiEdit' || o.tool === 'NotebookEdit') return `파일 고쳐도 될까요? ${o.file || ''}`.trim();
  if (o.tool === 'WebFetch' || o.tool === 'WebSearch') return '웹에 접속해도 될까요?';
  return `${o.tool || '도구'} 써도 될까요?`;
}
const ASK_KINDS = new Set(['permission_prompt', 'elicitation_dialog']);

function applyEvent(sid, o){
  let s = sessions.get(sid);
  if (!s) {
    s = { id: sid, app: o.app || 'claude', name: '', title: '', state: 'idle', startedAt: o.t, stateSince: o.t, last: o.t, cwd: null,
          project: null, group: null, subs: new Map(), pend: [], q: null, ended: false };
    sessions.set(sid, s);
  }
  s.last = Math.max(s.last, o.t);
  if (!s.cwd && o.cwd) s.cwd = o.cwd;
  if (o.project) s.project = String(o.project);
  if (o.group) s.group = String(o.group);
  if (o.pid) { s.pid = o.pid; s.pidAt = o.t; }
  const work = () => { if (s.state !== 'working') { s.state = 'working'; s.stateSince = o.t; s.startedAt = o.t; } };

  // 하위 작업자 안에서 일어난 사건: 그 하위 작업자만 바꾼다
  if (o.agent && o.ev !== 'SubagentStart' && o.ev !== 'SubagentStop' && s.subs.has(o.agent)) {
    const sub = s.subs.get(o.agent); sub.last = o.t;
    if (o.ev === 'PermissionRequest') sub.q = sub.q || { text: permText(o), at: o.t };
    else if (o.ev === 'Notification' && ASK_KINDS.has(o.kind)) sub.q = sub.q || { text: o.tool ? permText(o) : (o.msg || '확인이 필요해요'), at: o.t };
    else if (o.ev === 'PreToolUse' && o.tool === 'AskUserQuestion') sub.q = { text: o.q || '확인할 게 있어요', at: o.t };
    else if (/^(Pre|Post)ToolUse/.test(o.ev)) sub.q = null;
    return;
  }

  switch (o.ev) {
    case 'SessionStart':
      s.ended = false; if (o.title) s.title = o.title; break;
    case 'UserPromptSubmit':
      if (o.title) s.title = o.title;
      if (!s.name && o.prompt && o.from !== 'system') s.name = firstLine(o.prompt, 28);
      s.q = null; work(); break;
    case 'PreToolUse':
      s.ended = false; work();
      if (o.tool === 'AskUserQuestion') s.q = { text: o.q || '확인할 게 있어요', at: o.t };
      else if (o.tool === 'ExitPlanMode') s.q = { text: '계획 확인해 주세요', at: o.t };
      else s.q = null;
      if (o.tool === 'Agent' || o.tool === 'Task') s.pend.push(o.desc || o.subType || '');
      break;
    case 'PostToolUse': case 'PostToolUseFailure':
      work(); s.q = null; break;
    case 'PermissionRequest':
      s.q = s.q || { text: permText(o), at: o.t }; break;
    case 'Notification':
      if (ASK_KINDS.has(o.kind)) s.q = s.q || { text: o.tool ? permText(o) : (o.msg || '확인이 필요해요'), at: o.t };
      break;
    case 'Stop':
      s.q = null; if (s.state !== 'reporting') { s.state = 'reporting'; s.stateSince = o.t; } break;
    case 'Interrupt': // Codex에서 Esc로 멈춤: 결과 없이 내 차례가 됐으니 대기로
      s.q = null; if (s.state !== 'idle') { s.state = 'idle'; s.stateSince = o.t; } break;
    case 'StopFailure':
      s.q = null; s.err = o.err; if (s.state !== 'blocked') { s.state = 'blocked'; s.stateSince = o.t; } break;
    case 'SubagentStart':
      if (o.agent) s.subs.set(o.agent, { id: sid + '~' + o.agent, name: s.pend.shift() || o.agentType || '하위 작업', startedAt: o.t, last: o.t, q: null });
      break;
    case 'SubagentStop':
      if (o.agent) s.subs.delete(o.agent); break;
    case 'SessionEnd':
      s.ended = true; s.subs.clear(); s.q = null; s.pend = []; break;
  }
}

/* ── Claude가 꺼졌는지: 훅이 알려 준 프로세스 번호가 사라졌으면 퇴근 ──
   창을 닫거나 Ctrl+C로 끄면 종료 훅(SessionEnd)이 안 올 수 있어서 직접 확인한다.
   컴퓨터를 재부팅하기 전에 기록된 번호는 다른 프로세스일 수 있으니 믿지 않는다. */
const BOOT = Date.now() - os.uptime() * 1000;
function alive(pid){
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // EPERM: 있긴 한데 권한만 없음
}
function checkAlive(){
  for (const s of sessions.values()) {
    if (s.ended || !s.pid) continue;
    if (s.pidAt < BOOT || !alive(s.pid)) {
      s.ended = true; s.subs.clear(); s.q = null;
      if (booted) logEvent(s.id, { t: Date.now(), ev: 'Gone' });
    }
  }
}

/* ── 층(프로젝트)과 섬(팀): 처음 본 작업 폴더의 git 저장소 이름과 브랜치 ── */
function gitInfo(cwd){
  let dir = cwd;
  for (let i = 0; i < 40 && dir; i++) {
    const g = path.join(dir, '.git');
    try {
      const st = fs.statSync(g);
      let gitdir = g, root = dir;
      if (st.isFile()) { // 워크트리·서브모듈: "gitdir: …"
        const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(g, 'utf8'));
        if (m) {
          gitdir = path.resolve(dir, m[1].trim());
          const w = gitdir.split(path.sep + '.git' + path.sep + 'worktrees' + path.sep);
          if (w.length > 1) root = w[0];
        }
      }
      let branch = null;
      try {
        const head = fs.readFileSync(path.join(gitdir, 'HEAD'), 'utf8').trim();
        branch = head.startsWith('ref: ') ? head.slice(5).replace(/^refs\/heads\//, '') : head.slice(0, 7);
      } catch {}
      return { project: path.basename(root), branch };
    } catch {}
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  return { project: path.basename(cwd || '') || '기본', branch: null };
}

/* ── status.json 만들기 ── */
const iso = t => new Date(t).toISOString();
function buildStatus(){
  readNew(); checkAlive();
  const now = Date.now();
  const out = [], questions = [], projects = new Map(), groups = new Map();
  for (const s of sessions.values()) {
    if (s.ended) continue;
    const quiet = now - s.last;
    if (quiet > (s.state === 'working' ? GONE_WORKING : GONE_IDLE)) continue;
    if (!s.project || !s.group) {
      const g = s.cwd ? gitInfo(s.cwd) : { project: '기본', branch: null };
      if (!s.project) s.project = g.project;
      if (!s.group) s.group = g.branch || '작업';
    }
    let state = s.state, since = s.stateSince;
    if (state === 'reporting' && now - since > REPORT_TO_IDLE) { state = 'idle'; since += REPORT_TO_IDLE; }
    projects.set(s.project, { id: s.project, name: s.project });
    groups.set(s.project + '\u0000' + s.group, { id: s.group, name: s.group, project: s.project });
    out.push({ id: s.id, app: s.app, name: s.title || s.name || '새 세션', project: s.project, group: s.group, parent: null,
               state, startedAt: iso(s.startedAt), stateSince: iso(since) });
    if (s.q) questions.push({ id: 'q-' + s.id, sessionId: s.id, text: s.q.text, askedAt: iso(s.q.at) });
    for (const sub of s.subs.values()) {
      if (now - sub.last > GONE_WORKING) continue;
      out.push({ id: sub.id, app: s.app, name: sub.name, parent: s.id, state: 'working', startedAt: iso(sub.startedAt), stateSince: iso(sub.startedAt) });
      if (sub.q) questions.push({ id: 'q-' + sub.id, sessionId: sub.id, text: sub.q.text, askedAt: iso(sub.q.at) });
    }
  }
  return { updatedAt: iso(now), dayEnded: false, projects: [...projects.values()], groups: [...groups.values()], sessions: out, questions };
}

/* ── 터미널에 사건 한 줄씩 ── */
const LABEL = { SessionStart: '출근', SessionEnd: '퇴근', UserPromptSubmit: '일 받음', PreToolUse: '도구', PostToolUse: '', PostToolUseFailure: '도구 실패',
  PermissionRequest: '허락 요청', Notification: '알림', Stop: '결과 보고', StopFailure: '막힘', SubagentStart: '하위 작업 시작', SubagentStop: '하위 작업 끝', Interrupt: '멈춤(Esc)', Gone: '퇴근 (꺼짐 감지)' };
const APP_NAME = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };
let booted = false;
function logEvent(sid, o){
  if (!booted || !LABEL[o.ev]) return;
  const s = sessions.get(sid);
  const who = (s && (s.title || s.name)) || sid.slice(0, 8);
  const d = new Date(o.t), t = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
  const extra = o.tool ? ` ${o.tool}` : o.prompt ? ` "${firstLine(o.prompt, 30)}"` : o.kind ? ` ${o.kind}` : o.agentType ? ` ${o.agentType}` : '';
  const app = APP_NAME[(s && s.app) || o.app] || (s && s.app) || '';
  console.log(`[${t}] ${app ? app + ' · ' : ''}${who} · ${LABEL[o.ev]}${extra}${o.agent && o.ev.startsWith('Pre') ? ' (하위)' : ''}`);
}

/* ── 서버 ── */
const PAGE = path.join(HERE, 'office.html');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/office.html?src=file' }); return res.end(); }
  if (url.pathname === '/status.json') {
    let body; try { body = JSON.stringify(buildStatus()); } catch (e) { res.writeHead(500); return res.end(String(e)); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (url.pathname === '/office.html') {
    // 사옥 화면은 <body> 안쪽 조각이라 문서 틀을 씌워서 내준다
    let html; try { html = fs.readFileSync(PAGE, 'utf8'); } catch { res.writeHead(404); return res.end('office.html이 server.mjs 옆에 없습니다'); }
    if (!/^\s*<!doctype/i.test(html)) html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  res.writeHead(404); res.end();
});

readNew(); checkAlive(); booted = true;
server.listen(PORT, '127.0.0.1', () => {
  const live = [...sessions.values()].filter(s => !s.ended).length;
  console.log(`AI 세션 사옥: http://localhost:${PORT}`);
  console.log(`기록 폴더: ${DIR} (지금 세션 ${live}개)`);
  console.log('Claude Code · Codex · Gemini 세션의 사건이 아래에 한 줄씩 찍힙니다. 끄려면 Ctrl+C\n');
});
setInterval(() => { try { readNew(); checkAlive(); } catch {} }, 1000); // 화면을 안 열어도 터미널 로그는 계속
