#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dotenv;
mod files;
#[cfg(target_os = "macos")]
mod macos_quit;
mod state;

#[cfg(test)]
mod tests;

use dotenv::Entry;
use files::{Document, GitStatus};
use state::AppState;
use std::{path::Path, sync::Mutex};
use tauri::{AppHandle, Manager, State};

type SaveLock = Mutex<()>;

#[tauri::command]
fn load_state(app: AppHandle) -> Result<AppState, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法打开应用数据文件夹。")?;
    state::load_state(&data_dir)
}

#[tauri::command]
fn save_state(app: AppHandle, state: AppState, lock: State<'_, SaveLock>) -> Result<(), String> {
    let _guard = lock
        .lock()
        .map_err(|_| "无法开始保存。请重新打开 Envnote 后再试。")?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法打开应用数据文件夹。")?;
    state::save_state(&data_dir, &state)
}

#[tauri::command]
fn inspect_project(directory: String) -> Result<Vec<String>, String> {
    files::inspect_project(Path::new(&directory))
}

#[tauri::command]
fn read_document(path: String) -> Result<Document, String> {
    files::read_document(Path::new(&path))
}

#[tauri::command]
fn save_document(
    path: String,
    expected_revision: String,
    entries: Vec<Entry>,
    lock: State<'_, SaveLock>,
) -> Result<Document, String> {
    let _guard = lock
        .lock()
        .map_err(|_| "无法开始保存。请重新打开 Envnote 后再试。")?;
    files::save_document(Path::new(&path), &expected_revision, &entries)
}

#[tauri::command]
async fn git_status(path: String) -> GitStatus {
    files::git_status(Path::new(&path))
}

#[cfg(target_os = "macos")]
const QUIT_MENU_ID: &str = "envnote.quit";

#[cfg(target_os = "macos")]
fn macos_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem};

    // The default menu starts with the application submenu, which ends with Quit.
    let menu = Menu::default(app)?;
    let submenus = menu.items()?;
    let app_menu = submenus
        .first()
        .and_then(|item| item.as_submenu())
        .ok_or_else(|| std::io::Error::other("Missing macOS application menu"))?;
    let items = app_menu.items()?;
    let quit = items
        .last()
        .and_then(|item| item.as_predefined_menuitem())
        .ok_or_else(|| std::io::Error::other("Missing macOS Quit menu item"))?;
    let guarded_quit = MenuItem::with_id(app, QUIT_MENU_ID, quit.text()?, true, Some("Cmd+Q"))?;
    app_menu.remove(quit)?;
    app_menu.append(&guarded_quit)?;
    Ok(menu)
}

fn main() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(macos_menu)
        .on_menu_event(|app, event| {
            if event.id() == QUIT_MENU_ID {
                if let Some(window) = app.get_webview_window("main") {
                    // Use the same close request as the title-bar button to protect drafts.
                    let _ = window.close();
                }
            }
        })
        .setup(|app| {
            macos_quit::install(app.handle())?;
            Ok(())
        });
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(SaveLock::default())
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            inspect_project,
            read_document,
            save_document,
            git_status,
        ])
        .run(tauri::generate_context!())
        .expect("Envnote couldn't start");
}
