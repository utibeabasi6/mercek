use async_trait::async_trait;
use aws_sdk_cloudwatchlogs::Client;

use crate::domain::LogEvent;
use crate::error::AppResult;
use crate::resources::ecs::client::classify;
use crate::resources::logs::map;

#[async_trait]
pub trait LogsApi: Send + Sync {
    /// Fetch a page of log events; returns the events plus the forward token to
    /// resume from on the next poll.
    async fn get_log_events(
        &self,
        group: &str,
        stream: &str,
        token: Option<String>,
    ) -> AppResult<(Vec<LogEvent>, Option<String>)>;
}

pub struct SdkLogs {
    logs: Client,
    profile: String,
}

impl SdkLogs {
    pub fn new(logs: Client, profile: impl Into<String>) -> Self {
        Self { logs, profile: profile.into() }
    }
}

#[async_trait]
impl LogsApi for SdkLogs {
    async fn get_log_events(
        &self,
        group: &str,
        stream: &str,
        token: Option<String>,
    ) -> AppResult<(Vec<LogEvent>, Option<String>)> {
        let mut req = self
            .logs
            .get_log_events()
            .log_group_name(group)
            .log_stream_name(stream)
            .start_from_head(true)
            .limit(300);
        if let Some(token) = token {
            req = req.next_token(token);
        }
        let resp = req.send().await.map_err(|e| classify(&self.profile, e))?;
        let events = resp.events().iter().map(|e| map::event(e, stream)).collect();
        Ok((events, resp.next_forward_token().map(String::from)))
    }
}

#[cfg(feature = "mock")]
pub struct MockLogs;

#[cfg(feature = "mock")]
#[async_trait]
impl LogsApi for MockLogs {
    async fn get_log_events(
        &self,
        _group: &str,
        stream: &str,
        token: Option<String>,
    ) -> AppResult<(Vec<LogEvent>, Option<String>)> {
        Ok(crate::mock::log_lines(stream, token))
    }
}
