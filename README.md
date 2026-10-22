# AI 세션 사옥

Claude Code, Codex CLI, Gemini CLI 세션을 사무실 사람으로 보여 주는 화면입니다.
세션 하나가 사람 한 명, 프로젝트(git 저장소)마다 한 층, 브랜치마다 책상 섬, 맨 위층은 나(대표)의 방입니다.

두 가지로 쓸 수 있습니다.

- **맥 앱** (Tauri 2): 메뉴바에 상주하고, 앱 실행 파일이 훅까지 맡습니다. Node가 필요 없습니다.
- **로컬 테스트** (Node): 훅 스크립트와 작은 서버로 브라우저에서 봅니다. 앱 없이 빠르게 확인할 때.

```
Claude Code ┐
Codex CLI   ├─(훅)─▶ ~/.ai-office/events/<세션>.jsonl ─▶ 앱(또는 server.mjs) ─▶ 사옥 화면(office.html)
Gemini CLI  ┘
```

---

## 맥 앱

### 받기

`main`에 올리면 GitHub Actions가 맥 앱을 빌드합니다(20분쯤). 저장소 **Actions** 탭의 "맥 앱 빌드" 실행 화면 아래
**Artifacts**에서 `ai-office-macos`를 받아 풀면 dmg가 나옵니다. 애플 실리콘·인텔 둘 다 됩니다.
`v0.1.0`처럼 태그를 달아 올리면 Releases에도 dmg가 붙습니다.

### 설치

1. dmg를 열고 `AI Office`를 응용 프로그램 폴더로 끌어 놓습니다.
2. 개발자 인증서로 서명하지 않은 앱이라 처음엔 맥이 막습니다. 둘 중 하나로 엽니다.
   - 한 번 열어 보고 막히면 **시스템 설정 → 개인정보 보호 및 보안** 아래쪽의 **그래도 열기**
   - 터미널에서 `xattr -dr com.apple.quarantine "/Applications/AI Office.app"` 후 열기
3. 처음 켜면 "훅을 넣을까요?"라고 묻습니다. **훅 넣기**를 누르면 깔려 있는 도구마다 설정에 훅을 넣습니다.
   - Claude Code `~/.claude/settings.json`, Codex `~/.codex/hooks.json`, Gemini `~/.gemini/settings.json`
   - 기존 설정은 그대로 두고, 바꾸기 전에 같은 폴더에 `.bak-시각` 백업을 남깁니다.
   - 로컬 테스트용 Node 훅(`hook.mjs`)이 들어 있으면 앱 훅으로 바꿔 끼웁니다. 그 뒤로 `server.mjs`는 켤 필요 없습니다.
4. 이미 켜져 있던 세션은 껐다 켜야 훅이 붙습니다.

### 메뉴바

나에게 온 질문이 있으면 아이콘 옆에 질문 수가 뜹니다. 창을 닫아도 앱은 메뉴바에 남아 계속 따라갑니다.

| 메뉴 | 하는 일 |
|---|---|
| 세션 n · 작업 중 n · 질문 n | 지금 상태 |
| 사옥 열기 | 사옥 창 열기 |
| 훅 넣기·다시 넣기 | 세 도구 설정에 훅 넣기(도구를 새로 깔았을 때도) |
| 훅 빼기 | 사옥 훅만 빼기(다른 훅은 그대로) |
| 기록 지우기 | `~/.ai-office/events` 비우기 |
| 로그인할 때 켜기 | 맥을 켜면 메뉴바에 자동으로 |
| 종료 | 앱 끄기(훅은 계속 기록하고, 다시 켜면 이어서 보여 줌) |

터미널에서도 쓸 수 있습니다: `"/Applications/AI Office.app/Contents/MacOS/ai-office" install | uninstall | status`

### 직접 빌드

```bash
# Rust가 없으면: curl https://sh.rustup.rs -sSf | sh
npm install
npm run dev        # 개발 실행
npm run build      # dmg 만들기 → target/release/bundle/dmg
cargo test -p office-core   # 훅·상태 계산·설정 넣기 테스트
```

---

## 로컬 테스트 (Node, 앱 없이)

Node 18 이상만 있으면 됩니다.

```bash
node install.mjs   # 훅 등록 (깔린 도구만, 기존 설정 백업)
node server.mjs    # http://localhost:4317
```

새 터미널에서 `claude`, `codex`, `gemini`를 켜고 일을 시켜 보세요. 정리할 때는 `node server.mjs --clear`(기록 지우기),
`node install.mjs --uninstall`(훅 빼기). 앱을 쓰기 시작하면 앱이 이 훅을 앱 훅으로 바꿔 끼웁니다.

---

## 무엇이 어떻게 보이나

| 세션에서 | 사옥에서 |
|---|---|
| 세션 시작 | 엘리베이터 타고 출근, 휴게실에서 대기 |
| 프롬프트 보냄, 도구 사용 | 자기 책상에서 작업 중 (40분 넘으면 땀) |
| 하위 에이전트 띄움 (Claude, Codex) | 노란 모자 하위 작업자 출근, 팀 앞 회의 자리 |
| 권한 요청, 질문, 계획 승인 | 맨 위층 대표실 앞에 줄 서기 |
| 답 끝냄 | 결과 보고(만세), 3분 지나면 휴게실로 |
| Esc로 멈춤 (Codex) | 휴게실에서 대기 |
| API 오류·사용량 한도로 멈춤 (Claude) | 막힘(땀) |
| 세션 종료, 창 닫기, Ctrl+C | 1~2초 안에 퇴근 |
| 한 층(또는 팀 섬)에 아무도 없이 5분 | 층(섬) 철거 |

- **층**: 세션을 연 폴더의 git 저장소 이름(git이 아니면 폴더 이름). **섬**: 브랜치 이름. **이름**: 첫 프롬프트 첫 줄.
- 직접 정하려면: `AI_OFFICE_PROJECT=web AI_OFFICE_GROUP=fe claude`
- 도구가 두 가지 이상 섞이면 현황판 이름 앞에 도구 이름표(Claude, Codex, Gemini)가 붙습니다.

## 알아 둘 점

- 기록에는 프롬프트 앞 120자, 실행한 명령 앞 80자, 파일 이름이 들어갑니다. `~/.ai-office`에만 저장되고 밖으로 나가지 않습니다.
- 일주일 넘게 손대지 않은 기록 파일은 앱이 한 시간마다 지웁니다. 아직 켜져 있는 세션의 기록은 남깁니다.
- 훅을 넣을 때 남기는 설정 백업(`.bak-시각`)은 설정 파일마다 최근 3개만 남깁니다.
- 끈 세션은 훅이 기록해 둔 도구 프로세스 번호가 사라졌는지 1초마다 확인해서 알아챕니다.
- 도구마다 훅으로 알려 주는 범위가 달라서 Gemini는 하위 작업자가 나오지 않고, Codex는 "막힘"이 나오지 않습니다.
- 윈도우는 아직 지원하지 않습니다.

## 구조

```
office.html      사옥 화면(로컬 서버와 앱이 같이 씀)
hook.mjs, server.mjs, install.mjs   로컬 테스트용 Node 버전
core/            훅 기록, 세션 상태 계산, 훅 설치 (Rust, Tauri 없이 cargo test)
src-tauri/       맥 앱: 메뉴바, 창, 1초마다 "office-status" 이벤트, `ai-office hook` 훅 모드
scripts/         office.html → dist/index.html
.github/         맥 dmg 빌드
```
