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

    /// Tail every stream in a log group (all tasks of a service) since `start_ms`,
    /// optionally server-side filtered. Returns the events plus the next start time
    /// (max event timestamp + 1) to resume from on the following poll.
    async fn filter_log_events(
        &self,
        group: &str,
        filter_pattern: Option<String>,
        start_ms: i64,
    ) -> AppResult<(Vec<LogEvent>, i64)>;
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

    async fn filter_log_events(
        &self,
        group: &str,
        filter_pattern: Option<String>,
        start_ms: i64,
    ) -> AppResult<(Vec<LogEvent>, i64)> {
        let mut out: Vec<LogEvent> = Vec::new();
        let mut max_ts = start_ms;
        let mut token: Option<String> = None;
        // Page through this poll's window, capped so a busy group can't stall the tail.
        for _ in 0..6 {
            let mut req = self
                .logs
                .filter_log_events()
                .log_group_name(group)
                .start_time(start_ms)
                .limit(300);
            if let Some(fp) = filter_pattern.as_deref().filter(|s| !s.is_empty()) {
                req = req.filter_pattern(fp);
            }
            if let Some(t) = token.take() {
                req = req.next_token(t);
            }
            let resp = req.send().await.map_err(|e| classify(&self.profile, e))?;
            for e in resp.events() {
                if let Some(ts) = e.timestamp() {
                    max_ts = max_ts.max(ts);
                }
                out.push(map::filtered_event(e));
            }
            match resp.next_token() {
                Some(t) => token = Some(t.to_string()),
                None => break,
            }
        }
        Ok((out, max_ts + 1))
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

    async fn filter_log_events(
        &self,
        _group: &str,
        _filter_pattern: Option<String>,
        start_ms: i64,
    ) -> AppResult<(Vec<LogEvent>, i64)> {
        Ok((Vec::new(), start_ms))
    }
}
