use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::ipc::Channel;

use crate::domain::LogEvent;
use crate::error::AppResult;
use crate::resources::logs::LogsApi;

const POLL: Duration = Duration::from_secs(2);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Poll a log stream and push new events over the channel until the task is
/// aborted (stop_log_tail) or the channel closes (webview gone).
pub async fn run_tail(
    api: Arc<dyn LogsApi>,
    group: String,
    stream: String,
    channel: Channel<LogEvent>,
) -> AppResult<()> {
    let mut token: Option<String> = None;
    loop {
        let (events, next) = api.get_log_events(&group, &stream, token.clone()).await?;
        for event in events {
            if channel.send(event).is_err() {
                return Ok(());
            }
        }
        if next.is_some() {
            token = next;
        }
        tokio::time::sleep(POLL).await;
    }
}

/// Tail every stream in a log group (all tasks of a service) interleaved, starting
/// from the recent past, until aborted or the channel closes.
pub async fn run_filter_tail(
    api: Arc<dyn LogsApi>,
    group: String,
    filter_pattern: Option<String>,
    channel: Channel<LogEvent>,
) -> AppResult<()> {
    // Seed from a few minutes back so the view isn't empty on open.
    let mut start = now_ms() - 5 * 60 * 1000;
    loop {
        let (events, next) = api.filter_log_events(&group, filter_pattern.clone(), start).await?;
        for event in events {
            if channel.send(event).is_err() {
                return Ok(());
            }
        }
        start = next;
        tokio::time::sleep(POLL).await;
    }
}
