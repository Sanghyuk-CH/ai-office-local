//! 훅 모드: `ai-office hook --app claude|codex|gemini`
//! 각 도구가 사건마다 이 실행 파일을 부르고 stdin으로 JSON을 준다. 도구마다 다른 사건·도구 이름을
//! 사옥 공통 이름으로 맞추고, 필요한 칸만 골라 ~/.ai-office/events/<세션>.jsonl 에 한 줄 덧붙인다.
//! 지키는 것
//! - 무슨 일이 있어도 0으로 끝낸다. 2로 끝나면 도구 사용이 막히기 때문
//! - stdout은 도구가 요구하는 만큼만: Claude는 비움(문맥에 들어가지 않게), Gemini는 늘 "{}"(JSON만 받음),
//!   Codex는 Stop·SubagentStop·Interrupt 때만 "{}"(그 사건은 JSON만 받음)

use serde_json::{json, Map, Value};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;

use crate::paths;
use crate::procs;

fn cut(v: Option<&str>, n: usize) -> Option<String> {
    let s = v?;
    if s.chars().count() > n { Some(s.chars().take(n).collect::<String>() + "…") } else { Some(s.to_string()) }
}

fn map_event<'a>(app: &str, ev: &'a str) -> &'a str {
    match (app, ev) {
        ("gemini", "BeforeAgent") => "UserPromptSubmit",
        ("gemini", "AfterAgent") => "Stop",
        ("gemini", "BeforeTool") => "PreToolUse",
        ("gemini", "AfterTool") => "PostToolUse",
        _ => ev,
    }
}

fn map_tool<'a>(app: &str, tool: &'a str) -> &'a str {
    match (app, tool) {
        ("codex", "spawn_agent") => "Agent",
        ("codex", "apply_patch") => "Edit",
        ("gemini", "run_shell_command") => "Bash",
        ("gemini", "write_file") => "Write",
        ("gemini", "replace") => "Edit",
        ("gemini", "ask_user") => "AskUserQuestion",
        _ => tool,
    }
}

fn basename(p: &str) -> String {
    Path::new(p).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| p.to_string())
}

/// 받은 사건 하나를 기록 줄(JSON 객체)로 만든다. 기록할 것이 없으면 None
pub fn to_record(app: &str, d: &Value, now: i64, find_pid: &dyn Fn(&str) -> Option<i32>) -> Option<(String, Map<String, Value>)> {
    let raw_sid = d.get("session_id").and_then(Value::as_str).filter(|s| !s.is_empty())?;
    let ev = map_event(app, d.get("hook_event_name").and_then(Value::as_str)?).to_string();
    let empty = Map::new();
    let ti = d.get("tool_input").and_then(Value::as_object).unwrap_or(&empty);
    let gs = |k: &str| d.get(k).and_then(Value::as_str);
    let ts = |k: &str| ti.get(k).and_then(Value::as_str);

    let mut o = Map::new();
    o.insert("t".into(), json!(now));
    o.insert("ev".into(), json!(ev));
    o.insert("app".into(), json!(app));
    if let Some(c) = gs("cwd") { o.insert("cwd".into(), json!(c)); }
    if let Some(a) = gs("agent_id") {
        o.insert("agent".into(), json!(a));
        if let Some(t) = gs("agent_type") { o.insert("agentType".into(), json!(t)); }
    }
    let put = |o: &mut Map<String, Value>, k: &str, v: Option<String>| { if let Some(v) = v { o.insert(k.into(), json!(v)); } };

    match ev.as_str() {
        "SessionStart" => {
            put(&mut o, "source", gs("source").map(String::from));
            put(&mut o, "title", gs("session_title").map(String::from));
        }
        "UserPromptSubmit" => {
            put(&mut o, "prompt", cut(gs("prompt"), 120));
            put(&mut o, "title", gs("session_title").map(String::from));
            put(&mut o, "from", gs("source").map(String::from));
        }
        "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "PermissionRequest" => {
            let name = gs("tool_name").unwrap_or("");
            let tool = map_tool(app, name);
            o.insert("tool".into(), json!(tool));
            match tool {
                "Agent" | "Task" => {
                    put(&mut o, "desc", cut(ts("description").or(ts("message")).or(ts("prompt")), 60));
                    put(&mut o, "subType", ts("subagent_type").or(ts("agent_type")).map(String::from));
                }
                "AskUserQuestion" => {
                    let q = ti.get("questions").and_then(Value::as_array).and_then(|a| a.first()).and_then(|q| q.get("question")).and_then(Value::as_str);
                    put(&mut o, "q", cut(q.or(ts("question")).or(ts("prompt")), 140));
                }
                "Bash" => {
                    let cmd = match ti.get("command") {
                        Some(Value::String(s)) => Some(s.clone()),
                        Some(Value::Array(a)) => Some(a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" ")),
                        _ => None,
                    };
                    put(&mut o, "cmd", cut(cmd.as_deref(), 80));
                }
                _ => {}
            }
            if let Some(f) = ts("file_path").or(ts("absolute_path")) {
                o.insert("file".into(), json!(basename(f)));
            } else if name == "apply_patch" {
                let s = Value::Object(ti.clone()).to_string();
                for key in ["*** Update File: ", "*** Add File: ", "*** Delete File: "] {
                    if let Some(i) = s.find(key) {
                        let rest = &s[i + key.len()..];
                        let end = rest.find(|c| c == '\\' || c == '"').unwrap_or(rest.len());
                        o.insert("file".into(), json!(basename(rest[..end].trim())));
                        break;
                    }
                }
            }
            if ev == "PermissionRequest" {
                put(&mut o, "why", cut(ts("description"), 100));
            }
        }
        "Notification" => {
            let kind = gs("notification_type").map(|k| if k == "ToolPermission" { "permission_prompt" } else { k });
            put(&mut o, "kind", kind.map(String::from));
            put(&mut o, "msg", cut(gs("message"), 140));
            if let Some(det) = d.get("details").and_then(Value::as_object) {
                if let Some(tn) = det.get("tool_name").or(det.get("toolName")).and_then(Value::as_str) {
                    o.insert("tool".into(), json!(map_tool(app, tn)));
                }
                if let Some(c) = det.get("command").and_then(Value::as_str) { o.insert("cmd".into(), json!(cut(Some(c), 80))); }
                if let Some(f) = det.get("file_path").and_then(Value::as_str) { o.insert("file".into(), json!(basename(f))); }
            }
        }
        "StopFailure" => {
            if let Some(e) = d.get("error") { o.insert("err".into(), e.clone()); }
        }
        "SessionEnd" => put(&mut o, "reason", gs("reason").map(String::from)),
        "SubagentStart" | "SubagentStop" => {
            put(&mut o, "agent", gs("agent_id").map(String::from));
            put(&mut o, "agentType", gs("agent_type").map(String::from));
        }
        _ => {}
    }
    // 프로세스 번호는 세션 시작과 프롬프트 때만 찾는다(ps 한 번이라 도구마다 하지는 않음)
    if (ev == "SessionStart" || ev == "UserPromptSubmit") && d.get("agent_id").is_none() {
        if let Some(pid) = find_pid(app) { o.insert("pid".into(), json!(pid)); }
    }
    // 층·섬을 직접 정하고 싶을 때: AI_OFFICE_PROJECT=web AI_OFFICE_GROUP=fe claude
    if let Ok(p) = std::env::var("AI_OFFICE_PROJECT") { if !p.is_empty() { o.insert("project".into(), json!(p)); } }
    if let Ok(g) = std::env::var("AI_OFFICE_GROUP") { if !g.is_empty() { o.insert("group".into(), json!(g)); } }

    // Claude 세션은 id 그대로, 다른 도구는 앞에 도구 이름을 붙여 파일이 섞이지 않게
    let file = if app == "claude" { raw_sid.to_string() } else { format!("{app}-{raw_sid}") };
    let file: String = file.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' { c } else { '_' }).collect();
    Some((file, o))
}

fn append(file: &str, o: &Map<String, Value>) -> std::io::Result<()> {
    let dir = paths::events_dir();
    fs::create_dir_all(&dir)?;
    let mut line = Value::Object(o.clone()).to_string();
    line.push('\n');
    let mut f = OpenOptions::new().create(true).append(true).open(dir.join(format!("{file}.jsonl")))?;
    f.write_all(line.as_bytes()) // 한 번에 써서 동시에 쓰는 다른 훅과 줄이 섞이지 않게
}

/// 훅 모드 진입점. 늘 0을 돌려준다
pub fn run(app: &str) -> i32 {
    let mut buf = Vec::new();
    let _ = std::io::stdin().take(4_000_000).read_to_end(&mut buf);
    let mut name = String::new();
    if let Ok(d) = serde_json::from_slice::<Value>(&buf) {
        name = d.get("hook_event_name").and_then(Value::as_str).unwrap_or("").to_string();
        if let Some((file, o)) = to_record(app, &d, paths::now_ms(), &procs::find_app_pid) {
            let _ = append(&file, &o);
        }
    }
    if app == "gemini" || (app == "codex" && matches!(name.as_str(), "Stop" | "SubagentStop" | "Interrupt")) {
        let mut out = std::io::stdout();
        let _ = out.write_all(b"{}");
        let _ = out.flush();
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    fn no_pid(_: &str) -> Option<i32> { None }
    #[test]
    fn maps_gemini_and_codex() {
        let d = json!({"session_id":"g1","cwd":"/r","hook_event_name":"BeforeTool","tool_name":"run_shell_command","tool_input":{"command":"ls -la"}});
        let (f, o) = to_record("gemini", &d, 1, &no_pid).unwrap();
        assert_eq!(f, "gemini-g1");
        assert_eq!(o["ev"], "PreToolUse");
        assert_eq!(o["tool"], "Bash");
        assert_eq!(o["cmd"], "ls -la");
        let d = json!({"session_id":"k","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":["npm","test"],"description":"테스트 돌려도 될까요?"}});
        let (_, o) = to_record("codex", &d, 1, &no_pid).unwrap();
        assert_eq!(o["cmd"], "npm test");
        assert_eq!(o["why"], "테스트 돌려도 될까요?");
        let d = json!({"session_id":"k","hook_event_name":"PreToolUse","tool_name":"apply_patch","tool_input":{"input":"*** Begin Patch\n*** Update File: src/app.ts\n@@"}});
        let (_, o) = to_record("codex", &d, 1, &no_pid).unwrap();
        assert_eq!(o["tool"], "Edit");
        assert_eq!(o["file"], "app.ts");
        let d = json!({"session_id":"g","hook_event_name":"Notification","notification_type":"ToolPermission","message":"Allow?","details":{"tool_name":"run_shell_command"}});
        let (_, o) = to_record("gemini", &d, 1, &no_pid).unwrap();
        assert_eq!(o["kind"], "permission_prompt");
        assert_eq!(o["tool"], "Bash");
    }
    #[test]
    fn prompt_is_cut_and_pid_only_on_start() {
        let long = "가".repeat(200);
        let d = json!({"session_id":"c","hook_event_name":"UserPromptSubmit","prompt":long});
        let (f, o) = to_record("claude", &d, 1, &|_| Some(42)).unwrap();
        assert_eq!(f, "c");
        assert_eq!(o["prompt"].as_str().unwrap().chars().count(), 121);
        assert_eq!(o["pid"], 42);
        let d = json!({"session_id":"c","hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/a/b.md"}});
        let (_, o) = to_record("claude", &d, 1, &|_| Some(42)).unwrap();
        assert!(o.get("pid").is_none());
        assert_eq!(o["file"], "b.md");
    }
}
