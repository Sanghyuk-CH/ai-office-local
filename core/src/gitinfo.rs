//! 층(프로젝트) = 작업 폴더의 git 저장소 이름, 섬(팀) = 브랜치. git이 아니면 폴더 이름

use std::fs;
use std::path::{Path, PathBuf};

pub struct GitInfo {
    pub project: String,
    pub branch: Option<String>,
}

fn base(p: &Path) -> String {
    p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
}

pub fn git_info(cwd: &str) -> GitInfo {
    let start = PathBuf::from(cwd);
    let mut dir: Option<&Path> = Some(start.as_path());
    for _ in 0..40 {
        let Some(d) = dir else { break };
        let g = d.join(".git");
        if let Ok(meta) = fs::metadata(&g) {
            let mut gitdir = g.clone();
            let mut root = d.to_path_buf();
            if meta.is_file() {
                // 워크트리·서브모듈: "gitdir: …"
                if let Ok(text) = fs::read_to_string(&g) {
                    if let Some(line) = text.lines().find_map(|l| l.strip_prefix("gitdir:")) {
                        let p = PathBuf::from(line.trim());
                        gitdir = if p.is_absolute() { p } else { d.join(p) };
                        let s = gitdir.to_string_lossy().to_string();
                        if let Some(i) = s.find("/.git/worktrees/") {
                            root = PathBuf::from(&s[..i]);
                        }
                    }
                }
            }
            let branch = fs::read_to_string(gitdir.join("HEAD")).ok().map(|h| {
                let h = h.trim();
                match h.strip_prefix("ref: ") {
                    Some(r) => r.strip_prefix("refs/heads/").unwrap_or(r).to_string(),
                    None => h.chars().take(7).collect(),
                }
            });
            return GitInfo { project: base(&root), branch };
        }
        dir = d.parent();
    }
    let p = base(&start);
    GitInfo { project: if p.is_empty() { "기본".into() } else { p }, branch: None }
}
