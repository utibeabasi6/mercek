use std::sync::Arc;
use std::time::Duration;

use tauri::ipc::Channel;

use crate::domain::LogEvent;
use crate::error::AppResult;
use crate::resources::logs::LogsApi;

const POLL: Duration = Duration::from_secs(2);

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
