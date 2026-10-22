//! 기록 → 세션 상태 → 화면에 줄 status JSON
//! 파일마다 읽은 위치를 기억해 새로 붙은 줄만 읽는다. 사건 하나하나를 세션 상태에 반영하고,
//! 도구 프로세스가 사라졌으면(창 닫기, Ctrl+C) 종료 사건이 없어도 퇴근시킨다.

use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use crate::gitinfo::git_info;
use crate::paths::{self, iso};
use crate::procs;

const MIN: i64 = 60_000;
const HOUR: i64 = 60 * MIN;
const REPORT_TO_IDLE: i64 = 3 * MIN; // 결과 보고 뒤 3분 동안 답이 없으면 대기(휴게실)로
const GONE_WORKING: i64 = 2 * HOUR; // 프로세스 번호를 모르는 세션: 작업 중인데 2시간 조용하면 꺼진 것으로
const GONE_IDLE: i64 = 8 * HOUR; // 대기로 8시간이 지나도 꺼진 것으로
const SKIP_OLDER: i64 = 2 * 24 * HOUR; // 이틀 넘게 손대지 않은 기록 파일은 읽지 않는다

#[derive(Clone, Debug)]
pub struct Question {
    pub text: String,
    pub at: i64,
}

#[derive(Debug)]
struct Sub {
    agent: String,
    id: String,
    name: String,
    started_at: i64,
    last: i64,
    q: Option<Question>,
}

#[derive(Debug)]
struct Session {
    id: String,
    app: String,
    name: String,
    title: String,
    state: &'static str,
    started_at: i64,
    state_since: i64,
    last: i64,
    cwd: Option<String>,
    project: Option<String>,
    group: Option<String>,
    subs: Vec<Sub>,
    pend: VecDeque<String>,
    q: Option<Question>,
    ended: bool,
    pid: Option<i32>,
    pid_at: i64,
}

struct FileRec {
    off: u64,
    rest: Vec<u8>,
}

pub struct Store {
    dir: PathBuf,
    files: HashMap<String, FileRec>,
    sessions: Vec<Session>, // 처음 본 순서 그대로(층·자리 배정 순서가 흔들리지 않게)
    index: HashMap<String, usize>,
    boot: i64,
}

/// 화면 위쪽 메뉴바에 보여 줄 요약
#[derive(Default, Clone, Debug, PartialEq)]
pub struct Summary {
    pub sessions: usize,
    pub working: usize,
    pub questions: usize,
}

fn s<'a>(o: &'a Value, k: &str) -> Option<&'a str> {
    o.get(k).and_then(Value::as_str)
}

fn first_line(text: &str, n: usize) -> String {
    let l = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    if l.chars().count() > n { l.chars().take(n).collect::<String>() + "…" } else { l.to_string() }
}

fn perm_text(o: &Value) -> String {
    if let Some(w) = s(o, "why") {
        return w.to_string();
    }
    match s(o, "tool").unwrap_or("") {
        "Bash" => format!("명령 실행해도 될까요? {}", s(o, "cmd").unwrap_or("")).trim().to_string(),
        "Edit" | "Write" | "MultiEdit" | "NotebookEdit" => format!("파일 고쳐도 될까요? {}", s(o, "file").unwrap_or("")).trim().to_string(),
        "WebFetch" | "WebSearch" => "웹에 접속해도 될까요?".into(),
        "" => "도구 써도 될까요?".into(),
        t => format!("{t} 써도 될까요?"),
    }
}

fn is_ask(kind: Option<&str>) -> bool {
    matches!(kind, Some("permission_prompt") | Some("elicitation_dialog"))
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        Store { dir, files: HashMap::new(), sessions: Vec::new(), index: HashMap::new(), boot: procs::boot_ms() }
    }

    pub fn dir(&self) -> &PathBuf {
        &self.dir
    }

    /// 기록을 지운 뒤처럼 처음부터 다시
    pub fn reset(&mut self) {
        self.files.clear();
        self.sessions.clear();
        self.index.clear();
    }

    fn session_mut(&mut self, sid: &str, o: &Value) -> &mut Session {
        let t = o.get("t").and_then(Value::as_i64).unwrap_or(0);
        if !self.index.contains_key(sid) {
            self.sessions.push(Session {
                id: sid.to_string(),
                app: s(o, "app").unwrap_or("claude").to_string(),
                name: String::new(),
                title: String::new(),
                state: "idle",
                started_at: t,
                state_since: t,
                last: t,
                cwd: None,
                project: None,
                group: None,
                subs: Vec::new(),
                pend: VecDeque::new(),
                q: None,
                ended: false,
                pid: None,
                pid_at: 0,
            });
            self.index.insert(sid.to_string(), self.sessions.len() - 1);
        }
        let i = self.index[sid];
        &mut self.sessions[i]
    }

    /// 사건 하나를 세션 상태에 반영
    pub fn apply(&mut self, sid: &str, o: &Value) {
        let t = o.get("t").and_then(Value::as_i64).unwrap_or(0);
        let ev = s(o, "ev").unwrap_or("");
        let s_ = self.session_mut(sid, o);
        s_.last = s_.last.max(t);
        if s_.cwd.is_none() {
            if let Some(c) = s(o, "cwd") { s_.cwd = Some(c.to_string()); }
        }
        if let Some(p) = s(o, "project") { s_.project = Some(p.to_string()); }
        if let Some(g) = s(o, "group") { s_.group = Some(g.to_string()); }
        if let Some(pid) = o.get("pid").and_then(Value::as_i64) { s_.pid = Some(pid as i32); s_.pid_at = t; }
        let tool = s(o, "tool").unwrap_or("");

        // 하위 작업자 안에서 일어난 사건: 그 하위 작업자만 바꾼다
        if let Some(agent) = s(o, "agent") {
            if ev != "SubagentStart" && ev != "SubagentStop" {
                if let Some(sub) = s_.subs.iter_mut().find(|x| x.agent == agent) {
                    sub.last = t;
                    if ev == "PermissionRequest" {
                        if sub.q.is_none() { sub.q = Some(Question { text: perm_text(o), at: t }); }
                    } else if ev == "Notification" && is_ask(s(o, "kind")) {
                        if sub.q.is_none() {
                            let text = if o.get("tool").is_some() { perm_text(o) } else { s(o, "msg").unwrap_or("확인이 필요해요").to_string() };
                            sub.q = Some(Question { text, at: t });
                        }
                    } else if ev == "PreToolUse" && tool == "AskUserQuestion" {
                        sub.q = Some(Question { text: s(o, "q").unwrap_or("확인할 게 있어요").to_string(), at: t });
                    } else if ev.starts_with("PreToolUse") || ev.starts_with("PostToolUse") {
                        sub.q = None;
                    }
                    return;
                }
            }
        }

        let work = |x: &mut Session| {
            if x.state != "working" { x.state = "working"; x.state_since = t; x.started_at = t; }
        };
        match ev {
            "SessionStart" => {
                s_.ended = false;
                if let Some(ti) = s(o, "title") { s_.title = ti.to_string(); }
            }
            "UserPromptSubmit" => {
                if let Some(ti) = s(o, "title") { s_.title = ti.to_string(); }
                if s_.name.is_empty() && s(o, "from") != Some("system") {
                    if let Some(p) = s(o, "prompt") { s_.name = first_line(p, 28); }
                }
                s_.q = None;
                s_.ended = false;
                work(s_);
            }
            "PreToolUse" => {
                s_.ended = false;
                work(s_);
                s_.q = match tool {
                    "AskUserQuestion" => Some(Question { text: s(o, "q").unwrap_or("확인할 게 있어요").to_string(), at: t }),
                    "ExitPlanMode" => Some(Question { text: "계획 확인해 주세요".into(), at: t }),
                    _ => None,
                };
                if tool == "Agent" || tool == "Task" {
                    s_.pend.push_back(s(o, "desc").or(s(o, "subType")).unwrap_or("").to_string());
                }
            }
            "PostToolUse" | "PostToolUseFailure" => {
                work(s_);
                s_.q = None;
            }
            "PermissionRequest" => {
                if s_.q.is_none() { s_.q = Some(Question { text: perm_text(o), at: t }); }
            }
            "Notification" => {
                if is_ask(s(o, "kind")) && s_.q.is_none() {
                    let text = if o.get("tool").is_some() { perm_text(o) } else { s(o, "msg").unwrap_or("확인이 필요해요").to_string() };
                    s_.q = Some(Question { text, at: t });
                }
            }
            "Stop" => {
                s_.q = None;
                if s_.state != "reporting" { s_.state = "reporting"; s_.state_since = t; }
            }
            "Interrupt" => {
                // Codex에서 Esc로 멈춤: 결과 없이 내 차례가 됐으니 대기로
                s_.q = None;
                if s_.state != "idle" { s_.state = "idle"; s_.state_since = t; }
            }
            "StopFailure" => {
                s_.q = None;
                if s_.state != "blocked" { s_.state = "blocked"; s_.state_since = t; }
            }
            "SubagentStart" => {
                if let Some(agent) = s(o, "agent") {
                    let name = s_.pend.pop_front().filter(|n| !n.is_empty()).or_else(|| s(o, "agentType").map(String::from)).unwrap_or_else(|| "하위 작업".into());
                    let id = format!("{}~{}", s_.id, agent);
                    s_.subs.retain(|x| x.agent != agent);
                    s_.subs.push(Sub { agent: agent.to_string(), id, name, started_at: t, last: t, q: None });
                }
            }
            "SubagentStop" => {
                if let Some(agent) = s(o, "agent") { s_.subs.retain(|x| x.agent != agent); }
            }
            "SessionEnd" => {
                s_.ended = true;
                s_.subs.clear();
                s_.q = None;
                s_.pend.clear();
            }
            _ => {}
        }
    }

    /// 기록 폴더에서 새로 붙은 줄을 읽어 반영한다. 반영한 사건 수
    pub fn read_new(&mut self) -> usize {
        let now = paths::now_ms();
        let Ok(rd) = fs::read_dir(&self.dir) else { return 0 };
        let mut names: Vec<String> = rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.ends_with(".jsonl")).collect();
        names.sort();
        let mut applied = 0;
        for f in names {
            let full = self.dir.join(&f);
            let Ok(meta) = fs::metadata(&full) else { continue };
            let size = meta.len();
            let sid = f.trim_end_matches(".jsonl").to_string();
            if !self.files.contains_key(&f) {
                let mtime = meta.modified().ok().and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(now);
                let off = if now - mtime > SKIP_OLDER { size } else { 0 };
                self.files.insert(f.clone(), FileRec { off, rest: Vec::new() });
            }
            let rec = self.files.get_mut(&f).unwrap();
            if size < rec.off {
                // 파일이 새로 만들어짐: 그 세션을 처음부터
                rec.off = 0;
                rec.rest.clear();
                if let Some(i) = self.index.remove(&sid) {
                    self.sessions.remove(i);
                    self.index = self.sessions.iter().enumerate().map(|(i, x)| (x.id.clone(), i)).collect();
                }
            }
            let rec = self.files.get_mut(&f).unwrap();
            if size == rec.off { continue; }
            let mut buf = Vec::new();
            if let Ok(mut fh) = fs::File::open(&full) {
                if fh.seek(SeekFrom::Start(rec.off)).is_err() { continue; }
                let _ = fh.take(size - rec.off).read_to_end(&mut buf);
            }
            rec.off += buf.len() as u64;
            let mut data = std::mem::take(&mut rec.rest);
            data.extend_from_slice(&buf);
            let cut_at = data.iter().rposition(|b| *b == b'\n').map(|i| i + 1).unwrap_or(0);
            let rest = data.split_off(cut_at);
            self.files.get_mut(&f).unwrap().rest = rest;
            for line in data.split(|b| *b == b'\n') {
                if line.iter().all(u8::is_ascii_whitespace) { continue; }
                if let Ok(o) = serde_json::from_slice::<Value>(line) {
                    self.apply(&sid, &o);
                    applied += 1;
                }
            }
        }
        applied
    }

    /// 도구 프로세스가 사라졌으면 퇴근. 재부팅 전에 기록된 번호는 다른 프로세스일 수 있어 믿지 않는다
    pub fn check_alive(&mut self) -> usize {
        let mut gone = 0;
        for x in self.sessions.iter_mut() {
            if x.ended { continue; }
            let Some(pid) = x.pid else { continue };
            if (self.boot > 0 && x.pid_at < self.boot) || !procs::alive(pid) {
                x.ended = true;
                x.subs.clear();
                x.q = None;
                gone += 1;
            }
        }
        gone
    }

    /// 화면에 줄 status JSON과 메뉴바 요약
    pub fn status(&mut self, now: i64) -> (Value, Summary) {
        let mut out = Vec::new();
        let mut questions = Vec::new();
        let mut projects: Map<String, Value> = Map::new();
        let mut groups: Map<String, Value> = Map::new();
        let mut sum = Summary::default();
        for x in self.sessions.iter_mut() {
            if x.ended { continue; }
            let quiet = now - x.last;
            if x.pid.is_none() && quiet > (if x.state == "working" { GONE_WORKING } else { GONE_IDLE }) { continue; }
            if x.project.is_none() || x.group.is_none() {
                let g = x.cwd.as_deref().map(git_info);
                if x.project.is_none() { x.project = Some(g.as_ref().map(|g| g.project.clone()).unwrap_or_else(|| "기본".into())); }
                if x.group.is_none() { x.group = Some(g.and_then(|g| g.branch).unwrap_or_else(|| "작업".into())); }
            }
            let (proj, grp) = (x.project.clone().unwrap(), x.group.clone().unwrap());
            let (mut state, mut since) = (x.state, x.state_since);
            if state == "reporting" && now - since > REPORT_TO_IDLE { state = "idle"; since += REPORT_TO_IDLE; }
            projects.insert(proj.clone(), json!({ "id": proj, "name": proj }));
            groups.insert(format!("{proj}\u{0}{grp}"), json!({ "id": grp, "name": grp, "project": proj }));
            let name = if !x.title.is_empty() { x.title.clone() } else if !x.name.is_empty() { x.name.clone() } else { "새 세션".into() };
            out.push(json!({ "id": x.id, "app": x.app, "name": name, "project": proj, "group": grp, "parent": null,
                             "state": state, "startedAt": iso(x.started_at), "stateSince": iso(since) }));
            sum.sessions += 1;
            if state == "working" { sum.working += 1; }
            if let Some(q) = &x.q {
                questions.push(json!({ "id": format!("q-{}", x.id), "sessionId": x.id, "text": q.text, "askedAt": iso(q.at) }));
            }
            for sub in &x.subs {
                if now - sub.last > GONE_WORKING { continue; }
                out.push(json!({ "id": sub.id, "app": x.app, "name": sub.name, "parent": x.id, "state": "working",
                                 "startedAt": iso(sub.started_at), "stateSince": iso(sub.started_at) }));
                sum.sessions += 1;
                sum.working += 1;
                if let Some(q) = &sub.q {
                    questions.push(json!({ "id": format!("q-{}", sub.id), "sessionId": sub.id, "text": q.text, "askedAt": iso(q.at) }));
                }
            }
        }
        sum.questions = questions.len();
        let v = json!({
            "updatedAt": iso(now), "dayEnded": false,
            "projects": projects.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
            "groups": groups.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
            "sessions": out, "questions": questions,
        });
        (v, sum)
    }

    /// 한 번에: 새 기록 읽기 → 꺼진 세션 정리 → status
    pub fn tick(&mut self) -> (Value, Summary) {
        self.read_new();
        self.check_alive();
        self.status(paths::now_ms())
    }
}

/// 쌓인 기록 지우기. 지운 파일 수
pub fn clear_events(dir: &PathBuf) -> usize {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()) {
            if e.file_name().to_string_lossy().ends_with(".jsonl") && fs::remove_file(e.path()).is_ok() { n += 1; }
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("office-core-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn write(dir: &PathBuf, file: &str, lines: &[Value]) {
        let mut f = fs::OpenOptions::new().create(true).append(true).open(dir.join(format!("{file}.jsonl"))).unwrap();
        for l in lines { writeln!(f, "{}", l).unwrap(); }
    }

    #[test]
    fn full_flow() {
        let d = tmpdir("flow");
        let now = paths::now_ms();
        write(&d, "a", &[
            json!({"t":now-5000,"ev":"SessionStart","app":"claude","cwd":"/x/web"}),
            json!({"t":now-4000,"ev":"UserPromptSubmit","app":"claude","cwd":"/x/web","prompt":"로그인 고쳐줘\n자세히"}),
            json!({"t":now-3500,"ev":"PreToolUse","app":"claude","tool":"Agent","desc":"폼 찾기"}),
            json!({"t":now-3400,"ev":"SubagentStart","app":"claude","agent":"ag1","agentType":"Explore"}),
            json!({"t":now-3000,"ev":"PermissionRequest","app":"claude","tool":"Bash","cmd":"npm test"}),
        ]);
        write(&d, "codex-k", &[
            json!({"t":now-2000,"ev":"UserPromptSubmit","app":"codex","cwd":"/x/blog","prompt":"정리"}),
            json!({"t":now-1000,"ev":"Stop","app":"codex"}),
        ]);
        let mut st = Store::new(d.clone());
        assert_eq!(st.read_new(), 7);
        let (v, sum) = st.status(now);
        let ss = v["sessions"].as_array().unwrap();
        assert_eq!(ss.len(), 3);
        assert_eq!(ss[0]["name"], "로그인 고쳐줘");
        assert_eq!(ss[0]["project"], "web");
        assert_eq!(ss[0]["group"], "작업");
        assert_eq!(ss[1]["name"], "폼 찾기");
        assert_eq!(ss[1]["parent"], "a");
        assert_eq!(ss[2]["app"], "codex");
        assert_eq!(ss[2]["state"], "reporting");
        assert_eq!(v["questions"][0]["text"], "명령 실행해도 될까요? npm test");
        assert_eq!(sum, Summary { sessions: 3, working: 2, questions: 1 });

        // 덧붙은 줄만 새로 읽는다. 끝나지 않은 줄은 다음에
        let mut f = fs::OpenOptions::new().append(true).open(d.join("a.jsonl")).unwrap();
        write!(f, "{}\n{{\"t\":{},\"ev\":\"Sess", json!({"t":now,"ev":"PostToolUse","app":"claude","tool":"Bash"}), now).unwrap();
        drop(f);
        assert_eq!(st.read_new(), 1);
        let (v, _) = st.status(now);
        assert_eq!(v["questions"].as_array().unwrap().len(), 0);
        let mut f = fs::OpenOptions::new().append(true).open(d.join("a.jsonl")).unwrap();
        writeln!(f, "ionEnd\",\"app\":\"claude\"}}").unwrap();
        drop(f);
        assert_eq!(st.read_new(), 1);
        let (v, _) = st.status(now);
        assert_eq!(v["sessions"].as_array().unwrap().len(), 1);

        // 결과 보고 3분 뒤 대기
        let (v, _) = st.status(now + 4 * MIN);
        assert_eq!(v["sessions"][0]["state"], "idle");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn dead_process_leaves() {
        let d = tmpdir("dead");
        let now = paths::now_ms();
        // 지금 이 테스트 프로세스는 살아 있고, 아주 큰 번호는 없는 프로세스
        write(&d, "live", &[json!({"t":now,"ev":"SessionStart","app":"claude","cwd":"/x/a","pid":std::process::id()})]);
        write(&d, "dead", &[json!({"t":now,"ev":"SessionStart","app":"claude","cwd":"/x/a","pid":999_999_9})]);
        let mut st = Store::new(d.clone());
        st.read_new();
        assert_eq!(st.check_alive(), 1);
        let (v, _) = st.status(now);
        assert_eq!(v["sessions"].as_array().unwrap().len(), 1);
        assert_eq!(v["sessions"][0]["id"], "live");
        let _ = fs::remove_dir_all(&d);
    }
}
