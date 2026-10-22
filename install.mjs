#!/usr/bin/env node
// AI 세션 사옥 · 훅 설치/제거
//   node install.mjs              → ~/.claude/settings.json에 훅 등록 (기존 설정은 그대로, 백업 파일 생성)
//   node install.mjs --uninstall  → 이 도구가 넣은 훅만 빼기
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME_DIR = path.join(os.homedir(), '.ai-office');
const HOOK = path.join(HOME_DIR, 'hook.mjs');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MARK = '.ai-office/hook.mjs';
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop'];
const uninstall = process.argv.includes('--uninstall');

let settings = {};
if (fs.existsSync(SETTINGS)) {
  try { settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); }
  catch (e) { console.error(`${SETTINGS}을 읽지 못했습니다(JSON 형식 오류). 손대지 않고 끝냅니다.\n${e.message}`); process.exit(1); }
  const bak = SETTINGS + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(SETTINGS, bak);
  console.log(`기존 설정 백업: ${bak}`);
}
settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};

// 먼저 이 도구가 넣었던 항목을 모두 뺀다(다시 설치해도 두 번 들어가지 않게)
for (const ev of Object.keys(settings.hooks)) {
  const groups = Array.isArray(settings.hooks[ev]) ? settings.hooks[ev] : [];
  const kept = groups.map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes(MARK)) }))
                     .filter(g => g.hooks.length);
  if (kept.length) settings.hooks[ev] = kept; else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

if (!uninstall) {
  fs.mkdirSync(path.join(HOME_DIR, 'events'), { recursive: true });
  fs.copyFileSync(path.join(HERE, 'hook.mjs'), HOOK);
  // node 위치를 절대 경로로 박아 둔다(nvm 등으로 PATH가 달라도 동작하게)
  const command = `"${process.execPath}" "${HOOK}"`;
  settings.hooks = settings.hooks || {};
  for (const ev of EVENTS) {
    (settings.hooks[ev] = settings.hooks[ev] || []).push({ hooks: [{ type: 'command', command, timeout: 5 }] });
  }
}

fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');

if (uninstall) console.log('사옥 훅을 뺐습니다. 기록 폴더(~/.ai-office)는 남아 있으니 필요 없으면 지우세요.');
else {
  console.log(`훅 ${EVENTS.length}개를 등록했습니다 → ${SETTINGS}`);
  console.log(`훅 스크립트: ${HOOK}`);
  console.log('\n다음: node server.mjs 를 켜고, 새 터미널에서 claude 를 실행하세요. (이미 켜져 있던 세션은 껐다 켜야 훅이 적용됩니다)');
}
