use aws_sdk_cloudwatchlogs::types as cwl;
use aws_smithy_types::date_time::Format;
use aws_smithy_types::DateTime;

use crate::domain;

fn ms_iso(ms: i64) -> String {
    DateTime::from_millis(ms).fmt(Format::DateTime).unwrap_or_default()
}

pub fn event(e: &cwl::OutputLogEvent, stream: &str) -> domain::LogEvent {
    domain::LogEvent {
        timestamp: e.timestamp().map(ms_iso).unwrap_or_default(),
        message: e.message().unwrap_or_default().to_string(),
        ingestion_time: e.ingestion_time().map(ms_iso),
        stream: Some(stream.to_string()),
    }
}
