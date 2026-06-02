use async_trait::async_trait;
use aws_sdk_cloudwatch::types::{Dimension, Metric, MetricDataQuery, MetricStat, ScanBy};
use aws_sdk_cloudwatch::Client;
use aws_smithy_types::DateTime;

use crate::domain::MetricSeries;
use crate::error::AppResult;
use crate::resources::cloudwatch::map;
use crate::resources::ecs::client::classify;

#[derive(Debug, Clone)]
pub struct MetricQuery {
    pub id: String,
    pub label: String,
    pub namespace: String,
    pub metric_name: String,
    pub dimensions: Vec<(String, String)>,
    pub stat: String,
}

#[async_trait]
pub trait CloudwatchApi: Send + Sync {
    async fn get_metric_data(
        &self,
        queries: &[MetricQuery],
        start_secs: i64,
        end_secs: i64,
        period: i32,
    ) -> AppResult<Vec<MetricSeries>>;
}

pub struct SdkCloudwatch {
    cw: Client,
    profile: String,
}

impl SdkCloudwatch {
    pub fn new(cw: Client, profile: impl Into<String>) -> Self {
        Self { cw, profile: profile.into() }
    }
}

fn build_query(query: &MetricQuery, period: i32) -> MetricDataQuery {
    let dimensions = query
        .dimensions
        .iter()
        .map(|(name, value)| Dimension::builder().name(name).value(value).build())
        .collect::<Vec<_>>();
    let metric = Metric::builder()
        .namespace(&query.namespace)
        .metric_name(&query.metric_name)
        .set_dimensions(Some(dimensions))
        .build();
    let stat = MetricStat::builder()
        .metric(metric)
        .period(period)
        .stat(&query.stat)
        .build();
    MetricDataQuery::builder()
        .id(&query.id)
        .label(&query.label)
        .metric_stat(stat)
        .build()
}

#[async_trait]
impl CloudwatchApi for SdkCloudwatch {
    async fn get_metric_data(
        &self,
        queries: &[MetricQuery],
        start_secs: i64,
        end_secs: i64,
        period: i32,
    ) -> AppResult<Vec<MetricSeries>> {
        let data_queries: Vec<_> = queries.iter().map(|q| build_query(q, period)).collect();
        let resp = self
            .cw
            .get_metric_data()
            .set_metric_data_queries(Some(data_queries))
            .start_time(DateTime::from_secs(start_secs))
            .end_time(DateTime::from_secs(end_secs))
            .scan_by(ScanBy::TimestampAscending)
            .send()
            .await
            .map_err(|e| classify(&self.profile, e))?;
        Ok(resp.metric_data_results().iter().map(map::series).collect())
    }
}

pub struct MockCloudwatch;

#[async_trait]
impl CloudwatchApi for MockCloudwatch {
    async fn get_metric_data(
        &self,
        queries: &[MetricQuery],
        start_secs: i64,
        end_secs: i64,
        period: i32,
    ) -> AppResult<Vec<MetricSeries>> {
        Ok(queries
            .iter()
            .map(|q| crate::mock::metric_series(q, start_secs, end_secs, period))
            .collect())
    }
}
