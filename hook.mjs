#!/usr/bin/env node
// AI 세션 사옥 · Claude Code 훅
// Claude Code가 사건(프롬프트 보냄, 도구 사용, 답 끝냄 …)마다 이 스크립트를 실행하고 stdin으로 JSON을 준다.
// 필요한 칸만 골라 세션별 기록 파일(~/.ai-office/events/<session_id>.jsonl)에 한 줄 덧붙인다.
// - 화면(stdout)에는 아무것도 쓰지 않는다. SessionStart·UserPromptSubmit의 stdout은 Claude 문맥에 들어가기 때문.
// - 무슨 일이 있어도 정상 종료(0)한다. PreToolUse에서 2로 끝나면 도구 사용이 막히기 때문.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { execFileSync } from 'node:child_process';

const DIR = process.env.AI_OFFICE_DIR || path.join(os.homedir(), '.ai-office', 'events');

// 이 훅을 실행한 Claude Code 프로세스 번호(PID)를 찾는다. 서버가 이 번호로 살아 있는지 보고,
// 창을 닫거나 Ctrl+C로 꺼서 종료 훅이 안 와도 퇴근시킨다.
// 훅 → (셸) → claude 순으로 부모를 거슬러 올라가 명령줄이 claude인 첫 프로세스를 고른다.
const CLAUDE_ARGS = /(^|[\/\s])claude(\s|$)|@anthropic-ai\/claude-code|\/claude\/versions\//;
function findClaudePid(){
  if (process.platform === 'win32') return null; // 윈도우는 Tauri 때
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,ppid=,args='], { encoding: 'utf8', timeout: 1500, maxBuffer: 16e6 });
    const map = new Map();
    for (const line of out.split('\n')) { const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line); if (m) map.set(+m[1], { ppid: +m[2], args: m[3] }); }
    let pid = process.ppid;
    for (let i = 0; i < 12 && pid > 1; i++) {
      const p = map.get(pid); if (!p) break;
      if (CLAUDE_ARGS.test(p.args)) return pid;
      pid = p.ppid;
    }
  } catch {}
  return null;
}
const cut = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : undefined);

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { if (raw.length < 4e6) raw += c; });
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(raw);
    const sid = String(d.session_id || '').replace(/[^\w.-]/g, '_');
    const ev = d.hook_event_name;
    if (!sid || !ev) return;
    const ti = d.tool_input && typeof d.tool_input === 'object' ? d.tool_input : {};
    const o = { t: Date.now(), ev, cwd: d.cwd };
    if (d.agent_id) { o.agent = d.agent_id; o.agentType = d.agent_type; }

    switch (ev) {
      case 'SessionStart':
        o.source = d.source; o.title = d.session_title; break;
      case 'UserPromptSubmit':
        o.prompt = cut(d.prompt, 120); o.title = d.session_title; o.from = d.source; break;
      case 'PreToolUse': case 'PostToolUse': case 'PostToolUseFailure': case 'PermissionRequest':
        o.tool = d.tool_name;
        if (o.tool === 'Agent' || o.tool === 'Task') { o.desc = cut(ti.description, 60); o.subType = ti.subagent_type; }
        else if (o.tool === 'AskUserQuestion') o.q = cut(Array.isArray(ti.questions) && ti.questions[0] ? ti.questions[0].question : undefined, 140);
        else if (o.tool === 'Bash') o.cmd = cut(ti.command, 80);
        else if (typeof ti.file_path === 'string') o.file = path.basename(ti.file_path);
        break;
      case 'Notification':
        o.kind = d.notification_type; o.msg = cut(d.message, 140); break;
      case 'StopFailure':
        o.err = d.error; break;
      case 'SessionEnd':
        o.reason = d.reason; break;
      case 'SubagentStart': case 'SubagentStop':
        o.agent = d.agent_id; o.agentType = d.agent_type; break;
    }
    // 프로세스 번호는 세션 시작과 프롬프트 때만 찾는다(ps 한 번, 수십 ms라 도구마다 하지는 않음)
    if ((ev === 'SessionStart' || ev === 'UserPromptSubmit') && !d.agent_id) { const pid = findClaudePid(); if (pid) o.pid = pid; }
    // 층·섬을 직접 정하고 싶을 때: AI_OFFICE_PROJECT=web AI_OFFICE_GROUP=fe claude
    if (process.env.AI_OFFICE_PROJECT) o.project = process.env.AI_OFFICE_PROJECT;
    if (process.env.AI_OFFICE_GROUP) o.group = process.env.AI_OFFICE_GROUP;

    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(path.join(DIR, sid + '.jsonl'), JSON.stringify(o) + '\n');
  } catch { /* 기록 실패는 조용히 넘긴다. Claude Code 작업을 방해하지 않는 것이 먼저 */ }
});
