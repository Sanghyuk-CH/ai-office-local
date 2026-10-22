//! AI 세션 사옥의 바탕 부분. Tauri 없이도 빌드·테스트할 수 있게 따로 둔다.
//! - hook:    도구(Claude Code, Codex, Gemini)가 실행하는 훅. 사건을 세션별 기록 파일에 한 줄씩 남긴다
//! - store:   기록을 읽어 세션 상태를 계산하고 화면에 줄 status JSON을 만든다
//! - install: 각 도구 설정 파일에 훅을 넣고 빼기
//! - gitinfo: 작업 폴더의 git 저장소 이름(층)과 브랜치(섬)

pub mod gitinfo;
pub mod hook;
pub mod install;
pub mod paths;
pub mod procs;
pub mod store;
