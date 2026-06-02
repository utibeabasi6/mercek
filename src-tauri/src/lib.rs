pub mod aws;
pub mod commands;
pub mod db;
pub mod discovery;
pub mod domain;
pub mod error;
pub mod mock;
pub mod resources;
pub mod state;
pub mod streaming;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("resolve app data dir: {e}"))?;
            std::fs::create_dir_all(&dir).ok();
            let store = db::Store::open(dir.join("mercek.redb")).map_err(|e| e.to_string())?;
            app.manage(AppState::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::profiles::list_profiles,
            commands::profiles::get_scopes,
            commands::profiles::set_scopes,
            commands::discovery::discover,
            commands::discovery::discover_activated,
            commands::discovery::snapshot_activated,
            commands::discovery::cluster_resources,
            commands::discovery::task_definition,
            commands::services::target_health,
            commands::services::scaling,
            commands::metrics::service_metrics,
            commands::metrics::cluster_metrics,
            commands::logs::start_log_tail,
            commands::logs::stop_log_tail,
            commands::tasks::describe_eni,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
