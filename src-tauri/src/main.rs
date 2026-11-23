// Пиксельный задачник — Tauri shell: a frameless strip docked to the right screen edge
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent, Wry,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_opener::OpenerExt;

const WIDTH: f64 = 380.0;
static PINNED: AtomicBool = AtomicBool::new(true);
struct PinItem(CheckMenuItem<Wry>);

fn main_window(app: &AppHandle) -> WebviewWindow {
    app.get_webview_window("main").expect("main window")
}

/// Snap the window to the right edge of its monitor's work area (above the taskbar), full height.
fn dock(w: &WebviewWindow) {
    let monitor = w.current_monitor().ok().flatten().or_else(|| w.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let wa = m.work_area();
        let width = (WIDTH * m.scale_factor()).round() as u32;
        let _ = w.set_size(PhysicalSize::new(width, wa.size.height));
        // set_position moves the outer frame; frameless windows still have invisible resize borders,
        // so offset by (inner - outer) to put the visible content flush with the screen edge
        let (mut dx, mut dy) = (0, 0);
        if let (Ok(i), Ok(o)) = (w.inner_position(), w.outer_position()) { dx = i.x - o.x; dy = i.y - o.y; }
        let _ = w.set_position(PhysicalPosition::new(wa.position.x + wa.size.width as i32 - width as i32 - dx, wa.position.y - dy));
    }
}

fn show(w: &WebviewWindow) {
    dock(w);
    let _ = w.show();
    let _ = w.set_focus();
}

fn toggle(app: &AppHandle) {
    let w = main_window(app);
    if w.is_visible().unwrap_or(false) { let _ = w.hide(); } else { show(&w); }
}

fn set_pinned(app: &AppHandle, v: bool) {
    PINNED.store(v, Ordering::Relaxed);
    let _ = main_window(app).set_always_on_top(v);
    let _ = app.state::<PinItem>().0.set_checked(v);
    let _ = app.emit("pinned", v);
}

// ---- commands used by the page (window.dock shim) ----
#[tauri::command]
fn hide(app: AppHandle) { let _ = main_window(&app).hide(); }

#[tauri::command]
fn toggle_pin(app: AppHandle) { set_pinned(&app, !PINNED.load(Ordering::Relaxed)); }

#[tauri::command]
fn pinned() -> bool { PINNED.load(Ordering::Relaxed) }

/// Global cursor in the window's CSS pixels, so the eye can watch the whole screen.
#[tauri::command]
fn cursor(app: AppHandle) -> Option<serde_json::Value> {
    let w = main_window(&app);
    if !w.is_visible().unwrap_or(false) { return None; }
    let p = app.cursor_position().ok()?;
    let ip = w.inner_position().ok()?;
    let sz = w.inner_size().ok()?;
    let sf = w.scale_factor().ok()?;
    let (x, y) = (p.x - ip.x as f64, p.y - ip.y as f64);
    let inside = x >= 0.0 && y >= 0.0 && x < sz.width as f64 && y < sz.height as f64;
    Some(serde_json::json!({ "x": x / sf, "y": y / sf, "inside": inside }))
}

#[tauri::command]
fn copy(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Ask the local Ollama model (no CORS issues from Rust).
#[tauri::command]
async fn llm(body: serde_json::Value) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let r: serde_json::Value = ureq::post("http://127.0.0.1:11434/api/chat")
            .send_json(body).map_err(|e| e.to_string())?
            .into_json().map_err(|e| e.to_string())?;
        Ok(r["message"]["content"].as_str().unwrap_or_default().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) { return Err("only http(s) links".into()); }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// One-time import of data saved by the old Electron build (%APPDATA%\pixel-zadachnik-legacy.json).
#[tauri::command]
fn legacy_data() -> Option<String> {
    let p = std::path::Path::new(&std::env::var("APPDATA").ok()?).join("pixel-zadachnik-legacy.json");
    let data = std::fs::read_to_string(&p).ok()?;
    let _ = std::fs::rename(&p, p.with_extension("json.imported"));
    if data.trim().is_empty() { None } else { Some(data) }
}


/// Download a calendar feed (secret iCal link) for the Calendar tab; https only, no CORS from Rust.
#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    if !url.starts_with("https://") { return Err("only https links".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        ureq::get(&url).timeout(std::time::Duration::from_secs(20)).call().map_err(|e| e.to_string())?
            .into_string().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- bridge for the MCP server (mcp/server.js): files in %APPDATA%\com.pixel.zadachnik ----
fn data_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    let d = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&d).ok()?;
    Some(d)
}

/// The page writes its current tasks here so an AI (via MCP) can see what already exists.
#[tauri::command]
fn snapshot(app: AppHandle, json: String) {
    if let Some(d) = data_dir(&app) {
        let tmp = d.join("tasks.json.tmp");
        if std::fs::write(&tmp, json).is_ok() { let _ = std::fs::rename(&tmp, d.join("tasks.json")); }
    }
}

// ---- the board mirrored to a file, so it survives the WebView losing its storage ----
// Kept outside AppData on purpose: Windows can give a process a private copy of AppData (an app started from a packaged
// app, e.g. a dev tool, sees "AppData" redirected), so localStorage — and anything under AppData — may differ per launcher.
// %USERPROFILE%\.zadachnik is the same folder however the app is started.
fn state_dir() -> Option<std::path::PathBuf> {
    let d = std::path::Path::new(&std::env::var("USERPROFILE").ok()?).join(".zadachnik");
    std::fs::create_dir_all(&d).ok()?;
    Some(d)
}

/// The page hands over {S, LOCAL} after changes; the previous copy is kept as state.prev.json.
#[tauri::command]
fn state_save(json: String) {
    if json.len() < 20 { return; }
    if let Some(d) = state_dir() {
        let tmp = d.join("state.json.tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let cur = d.join("state.json");
            if cur.exists() { let _ = std::fs::copy(&cur, d.join("state.prev.json")); }
            let _ = std::fs::rename(&tmp, cur);
        }
    }
}

#[tauri::command]
fn state_load() -> Option<String> {
    std::fs::read_to_string(state_dir()?.join("state.json")).ok().filter(|s| !s.trim().is_empty())
}

/// Tasks dropped into inbox.json by the MCP server; claimed by renaming so a concurrent write isn't lost.
#[tauri::command]
fn take_inbox(app: AppHandle) -> Option<String> {
    let d = data_dir(&app)?;
    let claim = d.join("inbox.taking.json");
    std::fs::rename(d.join("inbox.json"), &claim).ok()?;
    let s = std::fs::read_to_string(&claim).ok();
    let _ = std::fs::remove_file(&claim);
    s
}


// ---- Google Calendar: OAuth for an installed app (loopback redirect + PKCE), tokens in <app data>\google.json ----
// The page makes the PKCE verifier/challenge; Rust listens on 127.0.0.1, swaps the code for tokens and proxies API calls.
fn gfile(app: &AppHandle) -> Option<std::path::PathBuf> { Some(data_dir(app)?.join("google.json")) }
fn unix_now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }
fn pct(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
        _ => format!("%{:02X}", b),
    }).collect()
}
fn unpct(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
fn ureq_err(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, r) => format!("Google {}: {}", code, r.into_string().unwrap_or_default().chars().take(300).collect::<String>()),
        e => e.to_string(),
    }
}
const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><body style=\"background:#000;color:#e7c56a;font:20px monospace;text-align:center;padding-top:20vh\">Готово! Задачник подключён к Google Календарю.<br><small style=\"color:#8b9bb0\">Эту вкладку можно закрыть.</small>";
const FAIL_PAGE: &str = "<!doctype html><meta charset=utf-8><body style=\"background:#000;color:#e88;font:20px monospace;text-align:center;padding-top:20vh\">Не получилось подключиться.<br><small style=\"color:#8b9bb0\">Вернись в задачник и попробуй ещё раз.</small>";

#[tauri::command]
async fn google_connect(app: AppHandle, client_id: String, client_secret: String, challenge: String, verifier: String, state: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
        let url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
            pct(&client_id), pct(&redirect), pct("https://www.googleapis.com/auth/calendar.events"), pct(&challenge), pct(&state));
        app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let started = std::time::Instant::now();
        // wait for the browser to come back (ignore stray connections such as favicon or pre-connects)
        let query = loop {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                    let mut buf = [0u8; 8192];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let path = req.split_whitespace().nth(1).unwrap_or("").to_string();
                    let q = path.splitn(2, '?').nth(1).unwrap_or("").to_string();
                    let ours = q.contains("code=") || q.contains("error=");
                    let page = if !ours { "" } else if q.contains("code=") { DONE_PAGE } else { FAIL_PAGE };
                    let status = if ours { "200 OK" } else { "404 Not Found" };
                    let _ = stream.write_all(format!("HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", status, page.len(), page).as_bytes());
                    if ours { break q; }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if started.elapsed().as_secs() > 300 { return Err("не дождался входа в Google (5 минут)".to_string()); }
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
                Err(e) => return Err(e.to_string()),
            }
        };
        let get = |k: &str| query.split('&').find_map(|p| { let mut it = p.splitn(2, '='); if it.next() == Some(k) { Some(unpct(it.next().unwrap_or(""))) } else { None } });
        if get("state").as_deref() != Some(state.as_str()) { return Err("ответ Google не совпал (state)".to_string()); }
        let code = match get("code") { Some(c) => c, None => return Err(format!("Google: {}", get("error").unwrap_or_else(|| "вход отменён".into()))) };
        let r: serde_json::Value = ureq::post("https://oauth2.googleapis.com/token")
            .send_form(&[("code", code.as_str()), ("client_id", client_id.as_str()), ("client_secret", client_secret.as_str()),
                         ("redirect_uri", redirect.as_str()), ("grant_type", "authorization_code"), ("code_verifier", verifier.as_str())])
            .map_err(ureq_err)?.into_json().map_err(|e| e.to_string())?;
        let refresh = r["refresh_token"].as_str().ok_or("Google не выдал refresh_token")?;
        let tok = serde_json::json!({
            "client_id": client_id, "client_secret": client_secret, "refresh_token": refresh,
            "access_token": r["access_token"], "exp": unix_now() + r["expires_in"].as_u64().unwrap_or(3600)
        });
        std::fs::write(gfile(&app).ok_or("нет папки данных")?, tok.to_string()).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn google_token(app: &AppHandle) -> Result<String, String> {
    let f = gfile(app).ok_or("нет папки данных")?;
    let mut t: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&f).map_err(|_| "Google не подключён".to_string())?).map_err(|e| e.to_string())?;
    if t["exp"].as_u64().unwrap_or(0) > unix_now() + 60 {
        if let Some(a) = t["access_token"].as_str() { return Ok(a.to_string()); }
    }
    let r = ureq::post("https://oauth2.googleapis.com/token").send_form(&[
        ("client_id", t["client_id"].as_str().unwrap_or("")), ("client_secret", t["client_secret"].as_str().unwrap_or("")),
        ("refresh_token", t["refresh_token"].as_str().unwrap_or("")), ("grant_type", "refresh_token")]);
    let r: serde_json::Value = match r {
        Ok(resp) => resp.into_json().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(400, _)) | Err(ureq::Error::Status(401, _)) => {
            let _ = std::fs::remove_file(&f);
            return Err("доступ к Google отозван — нужно войти заново".to_string());
        }
        Err(e) => return Err(ureq_err(e)),
    };
    let access = r["access_token"].as_str().ok_or("Google не выдал access_token")?.to_string();
    t["access_token"] = serde_json::Value::String(access.clone());
    t["exp"] = serde_json::Value::from(unix_now() + r["expires_in"].as_u64().unwrap_or(3600));
    let _ = std::fs::write(&f, t.to_string());
    Ok(access)
}

/// Calendar API proxy for the page (only https://www.googleapis.com/calendar/v3/…).
#[tauri::command]
async fn google_api(app: AppHandle, method: String, url: String, body: Option<String>) -> Result<String, String> {
    if !url.starts_with("https://www.googleapis.com/calendar/v3/") { return Err("only Calendar API".into()); }
    if !["GET", "POST", "PATCH", "PUT", "DELETE"].contains(&method.as_str()) { return Err("bad method".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let token = google_token(&app)?;
        let req = ureq::request(&method, &url).set("Authorization", &format!("Bearer {}", token)).timeout(std::time::Duration::from_secs(30));
        let resp = match body { Some(b) => req.set("Content-Type", "application/json").send_string(&b), None => req.call() };
        match resp {
            Ok(r) => r.into_string().map_err(|e| e.to_string()),
            Err(ureq::Error::Status(410, _)) if method == "DELETE" => Ok(String::new()), // already gone
            Err(e) => Err(ureq_err(e)),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn google_status(app: AppHandle) -> bool { gfile(&app).map(|f| f.exists()).unwrap_or(false) }

#[tauri::command]
fn google_disconnect(app: AppHandle) { if let Some(f) = gfile(&app) { let _ = std::fs::remove_file(f); } }

// ---- mods: what is playing (Windows media sessions: Spotify, browser, Yandex Music...) and the user's mods folder ----
#[cfg(windows)]
mod media {
    use windows::Media::Control::{GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status};
    use windows::Storage::Streams::DataReader;
    type R<T> = Result<T, String>;
    fn e(x: windows::core::Error) -> String { x.message().to_string() }
    fn session() -> R<Option<Session>> {
        let m = Manager::RequestAsync().map_err(e)?.join().map_err(e)?;
        Ok(m.GetCurrentSession().ok())
    }
    pub fn state() -> R<serde_json::Value> {
        let Some(s) = session()? else { return Ok(serde_json::Value::Null) };
        let p = s.TryGetMediaPropertiesAsync().map_err(e)?.join().map_err(e)?;
        let info = s.GetPlaybackInfo().map_err(e)?;
        let ctl = info.Controls().map_err(e)?;
        let tl = s.GetTimelineProperties().map_err(e)?;
        let sec = |d: windows::core::Result<windows::Foundation::TimeSpan>| d.map(|t| t.Duration as f64 / 1e7).unwrap_or(0.0);
        Ok(serde_json::json!({
            "title": p.Title().map(|x| x.to_string()).unwrap_or_default(),
            "artist": p.Artist().map(|x| x.to_string()).unwrap_or_default(),
            "album": p.AlbumTitle().map(|x| x.to_string()).unwrap_or_default(),
            "playing": info.PlaybackStatus().map(|x| x == Status::Playing).unwrap_or(false),
            "canNext": ctl.IsNextEnabled().unwrap_or(false),
            "canPrev": ctl.IsPreviousEnabled().unwrap_or(false),
            "pos": sec(tl.Position()), "dur": sec(tl.EndTime()),
            "app": s.SourceAppUserModelId().map(|x| x.to_string()).unwrap_or_default(),
        }))
    }
    /// album cover of the current track as a data: URL (read once per track by the page)
    pub fn art() -> R<Option<String>> {
        let Some(s) = session()? else { return Ok(None) };
        let p = s.TryGetMediaPropertiesAsync().map_err(e)?.join().map_err(e)?;
        let Ok(th) = p.Thumbnail() else { return Ok(None) };
        let st = th.OpenReadAsync().map_err(e)?.join().map_err(e)?;
        let size = st.Size().map_err(e)? as u32;
        if size == 0 || size > 3_000_000 { return Ok(None); }
        let r = DataReader::CreateDataReader(&st).map_err(e)?;
        r.LoadAsync(size).map_err(e)?.join().map_err(e)?;
        let mut buf = vec![0u8; size as usize];
        r.ReadBytes(&mut buf).map_err(e)?;
        let ct = st.ContentType().map(|x| x.to_string()).unwrap_or_default();
        Ok(Some(format!("data:{};base64,{}", if ct.starts_with("image/") { ct } else { "image/png".into() }, super::b64(&buf))))
    }
    pub fn control(action: &str) -> R<bool> {
        let Some(s) = session()? else { return Ok(false) };
        let op = match action {
            "play" => s.TryPlayAsync(), "pause" => s.TryPauseAsync(), "toggle" => s.TryTogglePlayPauseAsync(),
            "next" => s.TrySkipNextAsync(), "prev" => s.TrySkipPreviousAsync(), _ => return Err("unknown action".into()),
        };
        op.map_err(e)?.join().map_err(e)
    }
}
#[cfg(not(windows))]
mod media {
    pub fn state() -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
    pub fn art() -> Result<Option<String>, String> { Ok(None) }
    pub fn control(_: &str) -> Result<bool, String> { Ok(false) }
}
fn b64(d: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut o = String::with_capacity(d.len() * 4 / 3 + 4);
    for c in d.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 { o.push(if i <= c.len() { T[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' }); }
    }
    o
}
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn media_state() -> Result<serde_json::Value, String> { blocking(media::state).await }
#[tauri::command]
async fn media_art() -> Result<Option<String>, String> { blocking(media::art).await }
#[tauri::command]
async fn media_control(action: String) -> Result<bool, String> { blocking(move || media::control(&action)).await }

/// The mods folder sits next to Zadachnik.exe ("mods\<id>\", like in games);
/// if that place is not writable (e.g. Program Files), it falls back to <app data>\mods.
fn mods_root(app: &AppHandle) -> Option<std::path::PathBuf> {
    if let Some(d) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("mods"))) {
        let probe = d.join(".write-test");
        if std::fs::create_dir_all(&d).is_ok() && std::fs::write(&probe, b"").is_ok() {
            let _ = std::fs::remove_file(probe);
            return Some(d);
        }
    }
    let d = data_dir(app)?.join("mods");
    std::fs::create_dir_all(&d).ok()?;
    Some(d)
}

/// Mods the user dropped into the mods folder (mod.json + main.js [+ style.css, body.html, pictures, sounds]).
/// Text files come as text, pictures/sounds as data: URLs; at most 4 MB per mod.
#[tauri::command]
fn list_mods(app: AppHandle) -> Vec<serde_json::Value> {
    let Some(root) = mods_root(&app) else { return vec![] };
    let mut out = vec![];
    let Ok(dirs) = std::fs::read_dir(&root) else { return out };
    for d in dirs.flatten().filter(|d| d.path().is_dir()) {
        let mut files = serde_json::Map::new();
        let mut total = 0u64;
        let mut walk = vec![(d.path(), String::new())];
        while let Some((dir, pre)) = walk.pop() {
            let Ok(rd) = std::fs::read_dir(&dir) else { continue };
            for f in rd.flatten() {
                let p = f.path();
                let name = format!("{pre}{}", f.file_name().to_string_lossy());
                if p.is_dir() { if pre.matches('/').count() < 3 { walk.push((p, format!("{name}/"))); } continue; }
                total += f.metadata().map(|m| m.len()).unwrap_or(u64::MAX / 2);
                if total > 4_000_000 { break; }
                let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
                let mime = match ext.as_str() { "png" => "image/png", "gif" => "image/gif", "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp",
                    "wav" => "audio/wav", "mp3" => "audio/mpeg", "ogg" => "audio/ogg", _ => "" };
                let v = if !mime.is_empty() { std::fs::read(&p).ok().map(|b| format!("data:{mime};base64,{}", b64(&b))) }
                    else if matches!(ext.as_str(), "json" | "js" | "css" | "html" | "txt" | "md") { std::fs::read_to_string(&p).ok() } else { None };
                if let Some(v) = v { files.insert(name, v.into()); }
            }
        }
        out.push(serde_json::json!({ "dir": d.file_name().to_string_lossy(), "files": files }));
    }
    out
}
#[tauri::command]
fn open_mods_dir(app: AppHandle) -> Result<(), String> {
    let d = mods_root(&app).ok_or("no mods folder")?;
    std::process::Command::new("explorer").arg(&d).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        // a second launch shows the window; "Zadachnik.exe --quit" closes the running one cleanly (tray icon removed)
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--quit") { app.exit(0); } else { show(&main_window(app)); }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["ctrl+alt+t"]).expect("shortcut")
                .with_handler(|app, _sc, ev| { if ev.state == ShortcutState::Pressed { toggle(app); } })
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![hide, toggle_pin, pinned, cursor, copy, llm, open_url, legacy_data, snapshot, state_save, state_load, take_inbox, fetch_text,
            google_connect, google_api, google_status, google_disconnect,
            media_state, media_art, media_control, list_mods, open_mods_dir])
        .on_window_event(|w, ev| {
            if let WindowEvent::CloseRequested { api, .. } = ev { api.prevent_close(); let _ = w.hide(); } // ✕ hides to tray
        })
        .setup(|app| {
            let h = app.handle();
            let toggle_i = MenuItem::with_id(h, "toggle", "Показать / скрыть  (Ctrl+Alt+T)", true, None::<&str>)?;
            let pin_i = CheckMenuItem::with_id(h, "pin", "Поверх всех окон", true, true, None::<&str>)?;
            let dock_i = MenuItem::with_id(h, "dock", "Прижать к правому краю", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(h)?;
            let quit_i = MenuItem::with_id(h, "quit", "Выйти", true, None::<&str>)?;
            let menu = Menu::with_items(h, &[&toggle_i, &pin_i, &dock_i, &sep, &quit_i])?;
            app.manage(PinItem(pin_i));

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("icon"))
                .tooltip("Задачник")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "toggle" => toggle(app),
                    "pin" => set_pinned(app, !PINNED.load(Ordering::Relaxed)),
                    "dock" => dock(&main_window(app)),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        toggle(tray.app_handle());
                    }
                })
                .build(app)?;

            let w = main_window(h);
            dock(&w);
            let _ = w.set_always_on_top(true);
            let _ = w.show();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
