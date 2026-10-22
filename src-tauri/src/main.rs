//! AI 세션 사옥 앱
//! - `ai-office hook --app <도구>`로 실행되면 훅 모드: 사건 한 줄 기록하고 바로 끝(창 없음, 수 ms)
//! - 그냥 실행되면 앱: 메뉴바 아이콘 + 사옥 창. 1초마다 기록을 읽어 창에 "office-status" 이벤트로 보낸다.
//!   창을 닫아도 메뉴바에 남아 계속 기록을 따라간다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use office_core::{install, paths, store::{self, Store, Summary}};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const EVENT: &str = "office-status";

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("hook") {
        let app = args.iter().position(|a| a == "--app").and_then(|i| args.get(i + 1)).map(String::as_str).unwrap_or("claude");
        std::process::exit(office_core::hook::run(app));
    }
    // 터미널에서 쓰는 보조 명령: 훅 넣기·빼기, 지금 상태 한 번 보기
    match args.get(1).map(String::as_str) {
        Some("install") => { for l in install::apply(true, exe().as_deref()) { println!("{l}"); } return; }
        Some("uninstall") => { for l in install::apply(false, None) { println!("{l}"); } return; }
        Some("status") => {
            let (v, _) = Store::new(paths::events_dir()).tick();
            println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default());
            return;
        }
        _ => {}
    }
    run_app();
}

fn exe() -> Option<PathBuf> {
    std::env::current_exe().ok()
}

/// 창이 떠 있을 때만 독에 아이콘을 보인다(창을 닫으면 메뉴바에만 남음)
fn dock(_app: &AppHandle, _visible: bool) {
    #[cfg(target_os = "macos")]
    let _ = _app.set_dock_visibility(_visible);
}

fn show_main(app: &AppHandle) {
    dock(app, true);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn summary_text(s: &Summary) -> String {
    if s.sessions == 0 { "지금 일하는 세션 없음".into() } else { format!("세션 {} · 작업 중 {} · 질문 {}", s.sessions, s.working, s.questions) }
}

fn report(app: &AppHandle, title: &str, lines: Vec<String>) {
    app.dialog().message(lines.join("\n")).title(title).kind(MessageDialogKind::Info).show(|_| {});
}

/// 훅 설치. 처음 켤 때 묻고, 메뉴에서도 다시 할 수 있다
fn install_hooks(app: &AppHandle) {
    let lines = install::apply(true, exe().as_deref());
    let mut lines = lines;
    lines.push(String::new());
    lines.push("이미 켜져 있던 세션은 껐다 켜야 훅이 붙습니다.".into());
    report(app, "훅 설치", lines);
}

fn ask_install(app: &AppHandle) {
    let h = app.clone();
    app.dialog()
        .message("Claude Code·Codex·Gemini 설정 파일에 사옥 훅을 넣을까요?\n\n세션이 시작하고, 일하고, 질문하고, 끝나는 것을 기록해서 사옥에 보여 줍니다. 기존 설정은 그대로 두고, 바꾸기 전에 백업을 남깁니다. 메뉴바 아이콘의 메뉴에서 언제든 뺄 수 있습니다.")
        .title("AI 세션 사옥")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("훅 넣기".into(), "나중에".into()))
        .show(move |ok| if ok { install_hooks(&h) });
}

fn run_app() {
    let store = Arc::new(Mutex::new(Store::new(paths::events_dir())));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // 로그인할 때 켜질 때는 창 없이 메뉴바에만
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup({
            let store = store.clone();
            move |app| {
                let handle = app.handle().clone();

                // 메뉴바 아이콘과 메뉴
                let status = MenuItem::with_id(app, "status", "기록 읽는 중…", false, None::<&str>)?;
                let open = MenuItem::with_id(app, "open", "사옥 열기", true, None::<&str>)?;
                let hooks = MenuItem::with_id(app, "hooks", "훅 넣기·다시 넣기", true, None::<&str>)?;
                let unhook = MenuItem::with_id(app, "unhook", "훅 빼기", true, None::<&str>)?;
                let clear = MenuItem::with_id(app, "clear", "기록 지우기", true, None::<&str>)?;
                let auto_on = app.autolaunch().is_enabled().unwrap_or(false);
                let autostart = CheckMenuItem::with_id(app, "autostart", "로그인할 때 켜기", true, auto_on, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
                let sep = || PredefinedMenuItem::separator(app);
                let menu = Menu::with_items(app, &[&status, &open, &sep()?, &hooks, &unhook, &clear, &sep()?, &autostart, &sep()?, &quit])?;

                let tray_img = Image::from_bytes(include_bytes!("../icons/tray.png"))?;
                let st_menu = store.clone();
                let auto_item = autostart.clone();
                TrayIconBuilder::with_id("main")
                    .icon(tray_img)
                    .icon_as_template(true)
                    .tooltip("AI 세션 사옥")
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(move |app, event| match event.id().as_ref() {
                        "open" => show_main(app),
                        "hooks" => install_hooks(app),
                        "unhook" => report(app, "훅 빼기", install::apply(false, None)),
                        "clear" => {
                            let mut st = st_menu.lock().unwrap();
                            let n = store::clear_events(st.dir());
                            st.reset();
                            report(app, "기록 지우기", vec![format!("기록 {n}개를 지웠습니다.")]);
                        }
                        "autostart" => {
                            let al = app.autolaunch();
                            let on = al.is_enabled().unwrap_or(false);
                            let _ = if on { al.disable() } else { al.enable() };
                            let _ = auto_item.set_checked(al.is_enabled().unwrap_or(!on));
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;

                if std::env::args().any(|a| a == "--hidden") { dock(&handle, false); } else { show_main(&handle); }

                // 훅: 처음이면 넣을지 묻고, 이미 넣었으면 훅 실행 파일을 앱 버전에 맞춰 둔다
                let state = install::installed();
                if state.iter().any(|(_, on)| *on) {
                    if let Some(e) = exe() { let _ = install::ensure_bin(&e); }
                } else if !state.is_empty() {
                    ask_install(&handle);
                }

                // 1초마다: 새 기록 읽기 → 꺼진 세션 정리 → 창에 보내기, 메뉴바에 질문 수
                let st_loop = store.clone();
                std::thread::spawn(move || {
                    let mut last = Summary { sessions: usize::MAX, ..Default::default() };
                    loop {
                        let (value, sum) = { st_loop.lock().unwrap().tick() };
                        let _ = handle.emit(EVENT, &value);
                        if sum != last {
                            let _ = status.set_text(summary_text(&sum));
                            if let Some(tray) = handle.tray_by_id("main") {
                                let _ = tray.set_title(if sum.questions > 0 { Some(sum.questions.to_string()) } else { None });
                                let _ = tray.set_tooltip(Some(format!("AI 세션 사옥 · {}", summary_text(&sum))));
                            }
                            last = sum;
                        }
                        std::thread::sleep(Duration::from_secs(1));
                    }
                });
                Ok(())
            }
        })
        .on_window_event(|window, event| {
            // 창을 닫아도 앱은 메뉴바에 남는다
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                dock(window.app_handle(), false);
            }
        })
        .build(tauri::generate_context!())
        .expect("앱을 시작하지 못했습니다");

    app.run(|_app, _event| {
        // 독 아이콘을 누르면 숨긴 창을 다시 연다
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
