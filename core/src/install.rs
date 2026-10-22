//! 각 도구 설정 파일에 사옥 훅을 넣고 빼기
//! - Claude Code: ~/.claude/settings.json (timeout 초)
//! - Codex CLI:   ~/.codex/hooks.json     (timeout 초, 종료·중단은 최대 3초)
//! - Gemini CLI:  ~/.gemini/settings.json (timeout 밀리초)
//! 기존 설정은 그대로 두고 사옥 훅만 더하거나 뺀다. 바꾸기 전에 같은 폴더에 .bak-시각 백업을 남긴다.

use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::paths;

/// 사옥이 넣은 훅인지 알아보는 표시(예전 Node 훅도 함께 정리)
const MARKS: [&str; 2] = [".ai-office/bin/ai-office", ".ai-office/hook.mjs"];

pub struct Tool {
    pub app: &'static str,
    pub name: &'static str,
    pub dir: PathBuf,
    pub file: PathBuf,
    pub always: bool,
    pub events: &'static [&'static str],
}

pub fn tools() -> Vec<Tool> {
    let h = paths::home();
    vec![
        Tool { app: "claude", name: "Claude Code", dir: h.join(".claude"), file: h.join(".claude/settings.json"), always: false,
               events: &["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
                         "PermissionRequest", "Notification", "Stop", "StopFailure", "SubagentStart", "SubagentStop"] },
        Tool { app: "codex", name: "Codex CLI", dir: h.join(".codex"), file: h.join(".codex/hooks.json"), always: false,
               events: &["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest",
                         "Stop", "Interrupt", "SubagentStart", "SubagentStop"] },
        Tool { app: "gemini", name: "Gemini CLI", dir: h.join(".gemini"), file: h.join(".gemini/settings.json"), always: false,
               events: &["SessionStart", "SessionEnd", "BeforeAgent", "AfterAgent", "BeforeTool", "AfterTool", "Notification"] },
    ]
}

fn quote(s: &str) -> String {
    if s.chars().any(|c| c.is_whitespace() || "\"'$`\\".contains(c)) { Value::String(s.into()).to_string() } else { s.into() }
}

pub fn command(app: &str) -> String {
    format!("{} hook --app {}", quote(&paths::bin_path().to_string_lossy()), app)
}

fn handler(app: &str, ev: &str) -> Value {
    match app {
        "gemini" => json!({ "name": "ai-office", "type": "command", "command": command(app), "timeout": 5000 }),
        "codex" => json!({ "type": "command", "command": command(app), "timeout": if ev == "SessionEnd" || ev == "Interrupt" { 3 } else { 5 } }),
        _ => json!({ "type": "command", "command": command(app), "timeout": 5 }),
    }
}

fn is_ours(h: &Value) -> bool {
    let c = h.get("command").and_then(Value::as_str).unwrap_or("");
    MARKS.iter().any(|m| c.contains(m))
}

/// 설정에서 사옥 훅을 모두 빼고, add면 새로 넣는다
pub fn rewrite(conf: &mut Value, app: &str, events: &[&str], add: bool) {
    if !conf.is_object() { *conf = json!({}); }
    let obj = conf.as_object_mut().unwrap();
    let mut hooks = obj.remove("hooks").and_then(|v| if let Value::Object(m) = v { Some(m) } else { None }).unwrap_or_default();
    let keys: Vec<String> = hooks.keys().cloned().collect();
    for ev in keys {
        let Some(Value::Array(groups)) = hooks.get(&ev) else { continue };
        let kept: Vec<Value> = groups.iter().filter_map(|g| {
            let mut g = g.clone();
            if let Some(Value::Array(hs)) = g.get_mut("hooks") {
                hs.retain(|h| !is_ours(h));
                if hs.is_empty() { return None; }
            }
            Some(g)
        }).collect();
        if kept.is_empty() { hooks.remove(&ev); } else { hooks.insert(ev, Value::Array(kept)); }
    }
    if add {
        for ev in events {
            let entry = json!({ "hooks": [handler(app, ev)] });
            match hooks.get_mut(*ev) {
                Some(Value::Array(a)) => a.push(entry),
                _ => { hooks.insert(ev.to_string(), json!([entry])); }
            }
        }
    }
    if !hooks.is_empty() { obj.insert("hooks".into(), Value::Object(hooks)); }
}

fn has_ours(conf: &Value) -> bool {
    conf.get("hooks").and_then(Value::as_object).map(|m| {
        m.values().filter_map(Value::as_array).flatten().filter_map(|g| g.get("hooks").and_then(Value::as_array)).flatten().any(is_ours)
    }).unwrap_or(false)
}

fn read_conf(file: &Path) -> Result<Value, String> {
    if !file.exists() { return Ok(json!({})); }
    let text = fs::read_to_string(file).map_err(|e| e.to_string())?;
    if text.trim().is_empty() { return Ok(json!({})); }
    serde_json::from_str(&text).map_err(|e| format!("JSON 형식 오류: {e}"))
}

fn has_app_hook(conf: &Value) -> bool {
    conf.get("hooks").and_then(Value::as_object).map(|m| {
        m.values().filter_map(Value::as_array).flatten().filter_map(|g| g.get("hooks").and_then(Value::as_array)).flatten()
            .any(|h| h.get("command").and_then(Value::as_str).unwrap_or("").contains(MARKS[0]))
    }).unwrap_or(false)
}

/// 깔려 있는 도구마다 앱 훅이 들어 있는지 (예전 Node 훅만 있으면 false: 앱 훅으로 바꿔야 함)
pub fn installed() -> Vec<(&'static str, bool)> {
    tools().into_iter().filter(|t| t.dir.exists()).map(|t| (t.name, read_conf(&t.file).map(|c| has_app_hook(&c)).unwrap_or(false))).collect()
}

/// 훅 실행 파일 사본(~/.ai-office/bin/ai-office)이 앱과 다르면 새로 쓴다. 바뀌었으면 true
/// 복사 대신 새 파일로 쓰는 것은, 다운로드 격리 표시 같은 확장 속성을 옮기지 않으려고
pub fn ensure_bin(exe: &Path) -> std::io::Result<bool> {
    let dst = paths::bin_path();
    let src = fs::read(exe)?;
    if let Ok(cur) = fs::read(&dst) { if cur == src { return Ok(false); } }
    fs::create_dir_all(dst.parent().unwrap())?;
    let tmp = dst.with_extension("new");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&src)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755))?;
    }
    fs::rename(&tmp, &dst)?; // 실행 중인 훅이 있어도 안전하게 바꿔 끼운다
    Ok(true)
}

/// 설정 파일마다 남겨 둘 백업 수
const KEEP_BACKUPS: usize = 3;

/// 사옥이 만든 백업(<파일>.bak-<시각>)만 최신 keep개 남기고 지운다. 지운 수
/// 시각은 앱 형식(밀리초 숫자)과 예전 Node 형식(2026-10-22T12-03-24-624Z) 둘 다
pub fn prune_backups(file: &Path, keep: usize) -> usize {
    let (Some(dir), Some(name)) = (file.parent(), file.file_name()) else { return 0 };
    let prefix = format!("{}.bak-", name.to_string_lossy());
    let Ok(rd) = fs::read_dir(dir) else { return 0 };
    let mut baks: Vec<(std::time::SystemTime, PathBuf)> = rd.filter_map(|e| e.ok()).filter_map(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        let stamp = n.strip_prefix(&prefix)?;
        if stamp.is_empty() || !stamp.chars().all(|c| c.is_ascii_digit() || "TZ-".contains(c)) { return None; }
        Some((e.metadata().ok()?.modified().ok()?, e.path()))
    }).collect();
    baks.sort_by(|a, b| b.0.cmp(&a.0));
    baks.into_iter().skip(keep).filter(|(_, p)| fs::remove_file(p).is_ok()).count()
}

/// 깔려 있는 도구마다 훅을 넣거나(add) 뺀다. 결과를 한 줄씩
pub fn apply(add: bool, exe: Option<&Path>) -> Vec<String> {
    let mut report = Vec::new();
    if add {
        if let Some(exe) = exe {
            if let Err(e) = ensure_bin(exe) { report.push(format!("훅 실행 파일을 만들지 못했습니다: {e}")); return report; }
        }
        let _ = fs::create_dir_all(paths::events_dir());
    }
    let stamp = paths::now_ms();
    for t in tools() {
        if !t.dir.exists() && !t.always {
            if add { report.push(format!("{}: 설치되어 있지 않아 건너뜀", t.name)); }
            continue;
        }
        let mut conf = match read_conf(&t.file) {
            Ok(c) => c,
            Err(e) => { report.push(format!("{}: 설정 파일을 읽지 못해 손대지 않음 ({e})", t.name)); continue; }
        };
        if !add && !has_ours(&conf) { continue; }
        if t.file.exists() {
            let bak = PathBuf::from(format!("{}.bak-{stamp}", t.file.to_string_lossy()));
            let _ = fs::copy(&t.file, &bak);
            prune_backups(&t.file, KEEP_BACKUPS);
        }
        rewrite(&mut conf, t.app, t.events, add);
        let text = serde_json::to_string_pretty(&conf).unwrap_or_else(|_| "{}".into()) + "\n";
        if let Some(p) = t.file.parent() { let _ = fs::create_dir_all(p); }
        match fs::write(&t.file, text) {
            Ok(_) => report.push(if add { format!("{}: 훅 {}개 등록", t.name, t.events.len()) } else { format!("{}: 훅을 뺐습니다", t.name) }),
            Err(e) => report.push(format!("{}: 쓰지 못함 ({e})", t.name)),
        }
    }
    if report.is_empty() { report.push(if add { "훅을 넣을 도구(Claude Code, Codex, Gemini)를 찾지 못했습니다".into() } else { "뺄 훅이 없습니다".into() }); }
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rewrite_keeps_other_hooks_and_is_idempotent() {
        let mut c = json!({ "model": "opus", "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "say done" } ] },
            { "hooks": [ { "type": "command", "command": "\"/opt/node\" \"/Users/x/.ai-office/hook.mjs\"" } ] } ] } });
        rewrite(&mut c, "claude", &["Stop", "SessionStart"], true);
        rewrite(&mut c, "claude", &["Stop", "SessionStart"], true);
        assert_eq!(c["model"], "opus");
        assert_eq!(c["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(c["hooks"]["Stop"][0]["hooks"][0]["command"], "say done");
        assert!(c["hooks"]["Stop"][1]["hooks"][0]["command"].as_str().unwrap().ends_with("hook --app claude"));
        assert_eq!(c["hooks"]["SessionStart"].as_array().unwrap().len(), 1);
        assert!(has_ours(&c));
        rewrite(&mut c, "claude", &[], false);
        assert!(!has_ours(&c));
        assert_eq!(c["hooks"]["Stop"].as_array().unwrap().len(), 1);
        assert!(c["hooks"].get("SessionStart").is_none());
        let mut g = json!({ "theme": "Dracula" });
        rewrite(&mut g, "gemini", &["BeforeAgent"], true);
        assert_eq!(g["hooks"]["BeforeAgent"][0]["hooks"][0]["timeout"], 5000);
        let keys: Vec<&String> = g.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["theme", "hooks"]);
    }

    #[test]
    fn prune_backups_keeps_newest_and_only_ours() {
        use std::time::{Duration, SystemTime};
        let d = std::env::temp_dir().join(format!("office-core-bak-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        let names = ["settings.json.bak-1700000000001", "settings.json.bak-2025-01-01T00-00-00-000Z", "settings.json.bak-1700000000003",
                     "settings.json.bak-1700000000004", "settings.json.bak-1700000000005", "settings.json.bak-mine", "other.json.bak-1700000000000"];
        let base = SystemTime::now() - Duration::from_secs(1000);
        for (i, n) in names.iter().enumerate() {
            let f = fs::File::create(d.join(n)).unwrap();
            f.set_modified(base + Duration::from_secs(i as u64)).unwrap();
        }
        assert_eq!(prune_backups(&d.join("settings.json"), 3), 2);
        let mut left: Vec<String> = fs::read_dir(&d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        left.sort();
        assert_eq!(left, ["other.json.bak-1700000000000", "settings.json.bak-1700000000003", "settings.json.bak-1700000000004",
                          "settings.json.bak-1700000000005", "settings.json.bak-mine"]);
        let _ = fs::remove_dir_all(&d);
    }
}
