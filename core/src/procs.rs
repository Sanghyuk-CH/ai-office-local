//! 프로세스: 훅을 실행한 도구 프로세스 찾기, 살아 있는지 보기, 컴퓨터를 켠 시각

use std::collections::HashMap;
use std::process::Command;

/// 명령줄이 그 도구인지. 빈칸으로 나눈 토큰의 마지막 경로 조각이 도구 이름이면 맞다
/// (claude, /usr/local/bin/claude, node …/claude 모두). 설치 경로 모양도 함께 본다
pub fn looks_like(app: &str, args: &str) -> bool {
    // 이 훅을 감싼 셸(sh -c "… ai-office hook --app gemini")은 도구 이름이 들어 있어도 아니다
    if args.contains(".ai-office/bin/ai-office") || args.contains("hook.mjs") {
        return false;
    }
    let token_is = |name: &str| {
        args.split_whitespace().any(|t| {
            let t = t.trim_matches(|c| c == '"' || c == '\'');
            t.rsplit('/').next() == Some(name)
        })
    };
    match app {
        "claude" => token_is("claude") || args.contains("@anthropic-ai/claude-code") || args.contains("/claude/versions/"),
        "codex" => {
            token_is("codex")
                || args.contains("@openai/codex")
                || args.split_whitespace().any(|t| {
                    let b = t.rsplit('/').next().unwrap_or("");
                    b.starts_with("codex-aarch64") || b.starts_with("codex-x86_64")
                })
        }
        "gemini" => token_is("gemini") || args.contains("@google/gemini-cli"),
        _ => false,
    }
}

/// 훅 → (셸) → 도구 순으로 부모를 거슬러 올라가 그 도구인 첫 프로세스 번호
#[cfg(unix)]
pub fn find_app_pid(app: &str) -> Option<i32> {
    let out = Command::new("ps").args(["-axo", "pid=,ppid=,args="]).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut map: HashMap<i32, (i32, String)> = HashMap::new();
    for line in text.lines() {
        let line = line.trim_start();
        let mut it = line.splitn(2, char::is_whitespace);
        let pid = it.next().and_then(|s| s.parse::<i32>().ok());
        let rest = it.next().unwrap_or("").trim_start();
        let mut it2 = rest.splitn(2, char::is_whitespace);
        let ppid = it2.next().and_then(|s| s.parse::<i32>().ok());
        let args = it2.next().unwrap_or("").trim_start().to_string();
        if let (Some(pid), Some(ppid)) = (pid, ppid) {
            map.insert(pid, (ppid, args));
        }
    }
    let mut pid = std::os::unix::process::parent_id() as i32;
    for _ in 0..12 {
        if pid <= 1 {
            break;
        }
        let (ppid, args) = map.get(&pid)?;
        if looks_like(app, args) {
            return Some(pid);
        }
        pid = *ppid;
    }
    None
}

#[cfg(not(unix))]
pub fn find_app_pid(_app: &str) -> Option<i32> {
    None // 윈도우는 나중에
}

/// 프로세스가 살아 있는지. 권한이 없어서 못 보는 것(EPERM)도 살아 있는 것으로 친다
#[cfg(unix)]
pub fn alive(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    let r = unsafe { libc::kill(pid, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(not(unix))]
pub fn alive(_pid: i32) -> bool {
    true
}

/// 컴퓨터를 켠 시각(ms). 재부팅 전에 기록된 프로세스 번호는 믿지 않으려고 쓴다
#[cfg(target_os = "macos")]
pub fn boot_ms() -> i64 {
    let mut tv = libc::timeval { tv_sec: 0, tv_usec: 0 };
    let mut size = std::mem::size_of::<libc::timeval>();
    let name = b"kern.boottime\0";
    let r = unsafe {
        libc::sysctlbyname(name.as_ptr() as *const libc::c_char, &mut tv as *mut _ as *mut libc::c_void, &mut size, std::ptr::null_mut(), 0)
    };
    if r == 0 { tv.tv_sec as i64 * 1000 + tv.tv_usec as i64 / 1000 } else { 0 }
}

#[cfg(not(target_os = "macos"))]
pub fn boot_ms() -> i64 {
    let up = std::fs::read_to_string("/proc/uptime").ok().and_then(|s| s.split_whitespace().next().and_then(|v| v.parse::<f64>().ok()));
    match up {
        Some(secs) => crate::paths::now_ms() - (secs * 1000.0) as i64,
        None => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::looks_like;
    #[test]
    fn matches_tool_processes() {
        assert!(looks_like("claude", "claude"));
        assert!(looks_like("claude", "claude --resume"));
        assert!(looks_like("claude", "node /usr/local/bin/claude"));
        assert!(looks_like("claude", "/Users/s/.local/share/claude/versions/2.1.300"));
        assert!(!looks_like("claude", "/Applications/Claude.app/Contents/MacOS/Claude"));
        assert!(!looks_like("claude", "/bin/zsh -c source /Users/s/.claude/shell-snapshots/x.sh"));
        assert!(looks_like("codex", "codex"));
        assert!(looks_like("codex", "/opt/homebrew/lib/node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex/codex"));
        assert!(looks_like("codex", "node /opt/homebrew/bin/codex"));
        assert!(looks_like("gemini", "node /opt/homebrew/bin/gemini"));
        assert!(looks_like("gemini", "node --max-old-space-size=8192 /opt/homebrew/lib/node_modules/@google/gemini-cli/dist/index.js"));
        assert!(!looks_like("gemini", "sh -c /Users/s/.ai-office/bin/ai-office hook --app gemini"));
        assert!(!looks_like("codex", "sh -c \"/opt/node/bin/node\" \"/Users/s/.ai-office/hook.mjs\" --app codex"));
    }
}
