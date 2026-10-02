//! Tauri shell for the journal. The whole application lives in the web bundle;
//! this crate only opens the window and exposes two plugins: the scoped
//! file-system plugin that `src/storage/blobstore.tauri.ts` uses to persist the
//! SQLite file, and the dialog plugin so exports and backups can be saved to a
//! user-chosen path (the dialog adds the chosen path to the fs scope).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running the journal");
}
