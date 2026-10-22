#!/usr/bin/env node
// AI 세션 사옥 · 훅 설치/제거 (Claude Code / Codex CLI / Gemini CLI)
//   node install.mjs              → 깔려 있는 도구마다 훅 등록 (기존 설정은 그대로, 바꾸기 전에 백업)
//   node install.mjs --uninstall  → 이 도구가 넣은 훅만 빼기
//   node install.mjs --only codex → 특정 도구만 (claude, codex, gemini 중 쉼표로 여러 개)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const HOME_DIR = path.join(HOME, '.ai-office');
const HOOK = path.join(HOME_DIR, 'hook.mjs');
const MARK = '.ai-office/hook.mjs';
const uninstall = process.argv.includes('--uninstall');
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? new Set(String(process.argv[oi + 1] || '').split(',')) : null;

// 경로에 빈칸이 있을 때만 따옴표로 감싼다(도구마다 명령을 실행하는 방식이 조금씩 달라서)
const q = s => (/[\s"'$`\\]/.test(s) ? JSON.stringify(s) : s);
const cmd = app => `${q(process.execPath)} ${q(HOOK)}${app === 'claude' ? '' : ' --app ' + app}`;

const APPS = [
  { app: 'claude', name: 'Claude Code', dir: path.join(HOME, '.claude'), file: path.join(HOME, '.claude', 'settings.json'), always: true,
    events: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
             'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop'],
    handler: ev => ({ type: 'command', command: cmd('claude'), timeout: 5 }) },           // 초 단위
  { app: 'codex', name: 'Codex CLI', dir: path.join(HOME, '.codex'), file: path.join(HOME, '.codex', 'hooks.json'),
    events: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
             'Stop', 'Interrupt', 'SubagentStart', 'SubagentStop'],
    handler: ev => ({ type: 'command', command: cmd('codex'), timeout: ev === 'SessionEnd' || ev === 'Interrupt' ? 3 : 5 }) }, // 초 단위, 종료·중단은 최대 3초
  { app: 'gemini', name: 'Gemini CLI', dir: path.join(HOME, '.gemini'), file: path.join(HOME, '.gemini', 'settings.json'),
    events: ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent', 'BeforeTool', 'AfterTool', 'Notification'],
    handler: ev => ({ name: 'ai-office', type: 'command', command: cmd('gemini'), timeout: 5000 }) },   // 밀리초 단위
];

if (!uninstall) {
  fs.mkdirSync(path.join(HOME_DIR, 'events'), { recursive: true });
  fs.copyFileSync(path.join(HERE, 'hook.mjs'), HOOK);
}

const done = [];
for (const A of APPS) {
  if (only && !only.has(A.app)) continue;
  const exists = fs.existsSync(A.dir);
  if (!exists && !A.always) { if (!uninstall) console.log(`- ${A.name}: 설치되어 있지 않아 건너뜀 (${A.dir} 없음)`); continue; }

  let conf = {};
  if (fs.existsSync(A.file)) {
    try { conf = JSON.parse(fs.readFileSync(A.file, 'utf8')); }
    catch (e) { console.log(`- ${A.name}: ${A.file}을 읽지 못해(JSON 형식 오류) 손대지 않음. ${e.message}`); continue; }
    const bak = A.file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(A.file, bak);
  }
  const hooks = conf.hooks && typeof conf.hooks === 'object' ? conf.hooks : {};

  // 먼저 이 도구가 넣었던 항목을 모두 뺀다(다시 설치해도 두 번 들어가지 않게)
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    const kept = hooks[ev].map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes(MARK)) }))
                          .filter(g => g.hooks.length);
    if (kept.length) hooks[ev] = kept; else delete hooks[ev];
  }
  if (!uninstall) for (const ev of A.events) (hooks[ev] = hooks[ev] || []).push({ hooks: [A.handler(ev)] });

  if (Object.keys(hooks).length) conf.hooks = hooks; else delete conf.hooks;
  fs.mkdirSync(path.dirname(A.file), { recursive: true });
  fs.writeFileSync(A.file, JSON.stringify(conf, null, 2) + '\n');
  done.push(A);
  console.log(`- ${A.name}: ${uninstall ? '훅을 뺐습니다' : `훅 ${A.events.length}개 등록`} → ${A.file}`);
}

if (uninstall) console.log('\n기록 폴더(~/.ai-office)는 남아 있으니 필요 없으면 지우세요.');
else if (done.length) {
  console.log(`\n훅 스크립트: ${HOOK} (바꾸기 전 설정은 같은 폴더에 .bak-날짜 로 백업)`);
  console.log('다음: node server.mjs 를 켜고, 새 터미널에서 claude / codex / gemini 를 실행하세요.');
  console.log('이미 켜져 있던 세션은 껐다 켜야 훅이 적용됩니다.');
}
