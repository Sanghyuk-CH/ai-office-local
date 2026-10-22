// office.html(사옥 화면 조각, 로컬 서버와 앱이 같이 씀)을 문서 틀에 넣어 dist/index.html로 만든다. Tauri가 이 폴더를 앱에 담는다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, 'office.html'), 'utf8');
if (!/^\s*<!doctype/i.test(html)) {
  html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>';
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('dist/index.html 만듦');
