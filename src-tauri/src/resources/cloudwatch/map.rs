use aws_sdk_cloudwatch::types as cw;
use aws_smithy_types::date_time::Format;

use crate::domain;

pub fn series(r: &cw::MetricDataResult) -> domain::MetricSeries {
    let points = r
        .timestamps()
        .iter()
        .zip(r.values().iter())
        .map(|(ts, value)| domain::MetricPoint {
            timestamp: ts.fmt(Format::DateTime).unwrap_or_default(),
            value: *value,
        })
        .collect();
    domain::MetricSeries {
        label: r.label().unwrap_or_default().to_string(),
        namespace: String::new(),
        metric_name: r.id().unwrap_or_default().to_string(),
        unit: None,
        points,
    }
}
