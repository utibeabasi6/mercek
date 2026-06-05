pub mod agent;
pub mod aws;
pub mod commands;
pub mod db;
pub mod discovery;
pub mod domain;
pub mod error;
#[cfg(feature = "mock")]
pub mod mock;
pub mod resources;
pub mod state;
pub mod streaming;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `mercek --mcp`: run the read-only ECS tools as a stdio MCP server (no GUI).
    // This is what a harness (e.g. Claude Code) spawns when `mercek` is registered
    // in its MCP config. stdout is the JSON-RPC channel, so logs go to stderr only.
    if std::env::args().skip(1).any(|a| a == "--mcp") {
        tracing_subscriber::fmt()
            .with_writer(std::io::stderr)
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
            )
            .init();
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime for --mcp");
        if let Err(e) = rt.block_on(agent::mcp::run_stdio_server()) {
            eprintln!("mercek --mcp exited with error: {e}");
        }
        return;
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("resolve app data dir: {e}"))?;
            std::fs::create_dir_all(&dir).ok();
            let store = db::Store::open(dir.join("mercek.redb")).map_err(|e| e.to_string())?;
            let state = AppState::new(store);
            // Listen for navigate/propose intents from the out-of-process MCP tools.
            agent::ipc::serve(state.agent_intent_sink.clone());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::agent::agent_list,
            commands::agent::agent_connect,
            commands::agent::agent_set_mode,
            commands::agent::agent_prompt,
            commands::agent::agent_cancel,
            commands::agent::agent_disconnect,
            commands::agent::agent_threads_list,
            commands::agent::agent_thread_load,
            commands::agent::agent_thread_save,
            commands::agent::agent_thread_delete,
            commands::profiles::list_profiles,
            commands::profiles::get_scopes,
            commands::profiles::set_scopes,
            commands::profiles::throttle_active,
            commands::discovery::discover,
            commands::discovery::discover_activated,
            commands::discovery::snapshot_activated,
            commands::discovery::cluster_resources,
            commands::discovery::task_definition,
            commands::discovery::list_task_definitions,
            commands::discovery::list_task_def_families,
            commands::images::image_scan,
            commands::services::target_health,
            commands::services::scaling,
            commands::services::scale_service,
            commands::services::update_service,
            commands::services::force_deploy,
            commands::services::enable_exec,
            commands::services::deploy_image,
            commands::services::create_service,
            commands::services::delete_service,
            commands::clusters::create_cluster,
            commands::clusters::delete_cluster,
            commands::tasks::stop_task,
            commands::tasks::run_task,
            commands::tasks::register_revision,
            commands::tasks::register_task_def,
            commands::tasks::deregister_task_def,
            commands::metrics::service_metrics,
            commands::metrics::cluster_metrics,
            commands::metrics::alb_metrics,
            commands::logs::start_log_tail,
            commands::logs::start_log_tail_group,
            commands::logs::stop_log_tail,
            commands::exec::exec_start,
            commands::exec::exec_write,
            commands::exec::exec_resize,
            commands::exec::exec_stop,
            commands::tasks::describe_eni,
            commands::tasks::network_options,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
