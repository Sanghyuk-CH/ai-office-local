#!/usr/bin/env node
// AI 세션 사옥 · 훅 (Claude Code / Codex CLI / Gemini CLI 공용)
// 각 도구가 사건(프롬프트 보냄, 도구 사용, 답 끝냄 …)마다 이 스크립트를 실행하고 stdin으로 JSON을 준다.
// 도구마다 다른 사건 이름을 하나로 맞춘 뒤, 필요한 칸만 골라
// 세션별 기록 파일(~/.ai-office/events/<세션>.jsonl)에 한 줄 덧붙인다.
//   node hook.mjs                → Claude Code
//   node hook.mjs --app codex    → Codex CLI
//   node hook.mjs --app gemini   → Gemini CLI
// 지키는 것
// - 무슨 일이 있어도 정상 종료(0). 2로 끝나면 도구 사용이 막히기 때문.
// - stdout은 도구가 요구하는 만큼만: Claude는 비움(문맥에 들어가지 않게),
//   Gemini는 늘 "{}"(JSON만 받음), Codex는 Stop·SubagentStop·Interrupt 때만 "{}"(JSON만 받는 사건).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const argi = process.argv.indexOf('--app');
const APP = (argi > 0 && process.argv[argi + 1]) || 'claude';
const DIR = process.env.AI_OFFICE_DIR || path.join(os.homedir(), '.ai-office', 'events');
const cut = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : undefined);

// 도구마다 다른 사건 이름 → 사옥 공통 이름
const EVENT = {
  gemini: { BeforeAgent: 'UserPromptSubmit', AfterAgent: 'Stop', BeforeTool: 'PreToolUse', AfterTool: 'PostToolUse' },
};
// 도구마다 다른 도구 이름 → 사옥 공통 이름
const TOOL = {
  codex: { spawn_agent: 'Agent', apply_patch: 'Edit' },
  gemini: { run_shell_command: 'Bash', write_file: 'Write', replace: 'Edit', ask_user: 'AskUserQuestion' },
};
// 이 훅을 실행한 도구 프로세스를 알아보는 명령줄 모양
const PROC = {
  claude: /(^|[\/\s])claude(\s|$)|@anthropic-ai\/claude-code|\/claude\/versions\//,
  codex: /(^|[\/\s])codex(\s|$)|@openai\/codex|\/codex-(aarch64|x86_64)[^\s]*/,
  gemini: /(^|[\/\s])gemini(\s|$)|@google\/gemini-cli/,
};

// 도구 프로세스 번호(PID). 서버가 이 번호로 살아 있는지 보고, 창을 닫거나 Ctrl+C로 꺼서 종료 사건이 안 와도 퇴근시킨다.
// 훅 → (셸) → 도구 순으로 부모를 거슬러 올라가 명령줄이 그 도구인 첫 프로세스를 고른다.
function findAppPid(){
  if (process.platform === 'win32') return null; // 윈도우는 Tauri 때
  const re = PROC[APP]; if (!re) return null;
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,ppid=,args='], { encoding: 'utf8', timeout: 1500, maxBuffer: 16e6 });
    const map = new Map();
    for (const line of out.split('\n')) { const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line); if (m) map.set(+m[1], { ppid: +m[2], args: m[3] }); }
    let pid = process.ppid;
    for (let i = 0; i < 12 && pid > 1; i++) {
      const p = map.get(pid); if (!p) break;
      // 이 훅을 감싼 셸(sh -c "… hook.mjs --app gemini")은 명령줄에 도구 이름이 들어 있어도 건너뛴다
      if (!p.args.includes('hook.mjs') && re.test(p.args)) return pid;
      pid = p.ppid;
    }
  } catch {}
  return null;
}

function record(d){
  const raw = String(d.session_id || '');
  if (!raw) return null;
  const ev = (EVENT[APP] && EVENT[APP][d.hook_event_name]) || d.hook_event_name;
  if (!ev) return null;
  const ti = d.tool_input && typeof d.tool_input === 'object' ? d.tool_input : {};
  const o = { t: Date.now(), ev, app: APP, cwd: d.cwd };
  if (d.agent_id) { o.agent = d.agent_id; o.agentType = d.agent_type; }

  switch (ev) {
    case 'SessionStart':
      o.source = d.source; o.title = d.session_title; break;
    case 'UserPromptSubmit':
      o.prompt = cut(typeof d.prompt === 'string' ? d.prompt : undefined, 120); o.title = d.session_title; o.from = d.source; break;
    case 'PreToolUse': case 'PostToolUse': case 'PostToolUseFailure': case 'PermissionRequest': {
      const name = d.tool_name;
      o.tool = (TOOL[APP] && TOOL[APP][name]) || name;
      if (o.tool === 'Agent' || o.tool === 'Task') o.desc = cut(ti.description || ti.message || ti.prompt, 60), o.subType = ti.subagent_type || ti.agent_type;
      else if (o.tool === 'AskUserQuestion') o.q = cut(Array.isArray(ti.questions) && ti.questions[0] ? ti.questions[0].question : (ti.question || ti.prompt), 140);
      else if (o.tool === 'Bash') o.cmd = cut(Array.isArray(ti.command) ? ti.command.join(' ') : ti.command, 80);
      if (typeof ti.file_path === 'string') o.file = path.basename(ti.file_path);
      else if (typeof ti.absolute_path === 'string') o.file = path.basename(ti.absolute_path);
      else if (name === 'apply_patch') { const m = /\*\*\* (?:Update|Add|Delete) File: ([^\n"\\]+)/.exec(JSON.stringify(ti)); if (m) o.file = path.basename(m[1].trim()); }
      if (ev === 'PermissionRequest' && typeof ti.description === 'string') o.why = cut(ti.description, 100);
      break;
    }
    case 'Notification':
      // Claude: permission_prompt / idle_prompt …, Gemini: ToolPermission
      o.kind = d.notification_type === 'ToolPermission' ? 'permission_prompt' : d.notification_type;
      o.msg = cut(d.message, 140);
      if (d.details && typeof d.details === 'object') {
        const tn = d.details.tool_name || d.details.toolName;
        if (tn) o.tool = (TOOL[APP] && TOOL[APP][tn]) || tn;
        if (typeof d.details.command === 'string') o.cmd = cut(d.details.command, 80);
        if (typeof d.details.file_path === 'string') o.file = path.basename(d.details.file_path);
      }
      break;
    case 'StopFailure':
      o.err = d.error; break;
    case 'SessionEnd':
      o.reason = d.reason; break;
    case 'SubagentStart': case 'SubagentStop':
      o.agent = d.agent_id; o.agentType = d.agent_type; break;
  }
  // 프로세스 번호는 세션 시작과 프롬프트 때만 찾는다(ps 한 번, 수십 ms라 도구마다 하지는 않음)
  if ((ev === 'SessionStart' || ev === 'UserPromptSubmit') && !d.agent_id) { const pid = findAppPid(); if (pid) o.pid = pid; }
  // 층·섬을 직접 정하고 싶을 때: AI_OFFICE_PROJECT=web AI_OFFICE_GROUP=fe claude
  if (process.env.AI_OFFICE_PROJECT) o.project = process.env.AI_OFFICE_PROJECT;
  if (process.env.AI_OFFICE_GROUP) o.group = process.env.AI_OFFICE_GROUP;

  // Claude 세션은 예전처럼 id 그대로, 다른 도구는 앞에 도구 이름을 붙여 파일이 섞이지 않게
  const file = (APP === 'claude' ? raw : APP + '-' + raw).replace(/[^\w.-]/g, '_');
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(path.join(DIR, file + '.jsonl'), JSON.stringify(o) + '\n');
  return ev;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { if (raw.length < 4e6) raw += c; });
process.stdin.on('end', () => {
  let name = '';
  try { const d = JSON.parse(raw); name = d.hook_event_name || ''; record(d); }
  catch { /* 기록 실패는 조용히 넘긴다. 도구 작업을 방해하지 않는 것이 먼저 */ }
  if (APP === 'gemini' || (APP === 'codex' && /^(Stop|SubagentStop|Interrupt)$/.test(name))) process.stdout.write('{}');
});
