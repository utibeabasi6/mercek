use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use aws_config::retry::RetryConfig;

pub fn retry_config() -> RetryConfig {
    RetryConfig::adaptive().with_max_attempts(8)
}

/// Process-global record of the last time AWS throttled us, so the status bar can
/// surface a throttle indicator. Recorded by `classify` on a
/// `ThrottlingException`.
static LAST_THROTTLE_SECS: AtomicU64 = AtomicU64::new(0);
const THROTTLE_WINDOW_SECS: u64 = 8;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn note_throttle() {
    LAST_THROTTLE_SECS.store(now_secs(), Ordering::Relaxed);
}

pub fn throttled_recently() -> bool {
    let last = LAST_THROTTLE_SECS.load(Ordering::Relaxed);
    last != 0 && now_secs().saturating_sub(last) <= THROTTLE_WINDOW_SECS
}
