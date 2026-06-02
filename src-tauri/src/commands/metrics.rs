use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::commands::profiles::use_mock;
use crate::domain::{MetricSeries, Scope};
use crate::error::AppResult;
use crate::resources::cloudwatch::{CloudwatchApi, MetricQuery, MockCloudwatch};
use crate::state::AppState;

const WINDOW_SECS: i64 = 3 * 3600;
const PERIOD: i32 = 60;

fn window() -> (i64, i64) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    (now - WINDOW_SECS, now)
}

async fn cloudwatch(state: &AppState, scope: &Scope) -> AppResult<Arc<dyn CloudwatchApi>> {
    if use_mock() {
        Ok(Arc::new(MockCloudwatch))
    } else {
        Ok(state.pool.get(scope).await?.cloudwatch.clone())
    }
}

fn ecs_metric(id: &str, label: &str, metric: &str, dimensions: Vec<(String, String)>) -> MetricQuery {
    MetricQuery {
        id: id.to_string(),
        label: label.to_string(),
        namespace: "AWS/ECS".to_string(),
        metric_name: metric.to_string(),
        dimensions,
        stat: "Average".to_string(),
    }
}

#[tauri::command]
pub async fn service_metrics(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    service: String,
) -> AppResult<Vec<MetricSeries>> {
    let dimensions = vec![
        ("ClusterName".to_string(), cluster),
        ("ServiceName".to_string(), service),
    ];
    let queries = vec![
        ecs_metric("cpu", "CPU %", "CPUUtilization", dimensions.clone()),
        ecs_metric("mem", "Memory %", "MemoryUtilization", dimensions),
    ];
    let (start, end) = window();
    cloudwatch(state.inner(), &scope)
        .await?
        .get_metric_data(&queries, start, end, PERIOD)
        .await
}

#[tauri::command]
pub async fn cluster_metrics(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
) -> AppResult<Vec<MetricSeries>> {
    let dimensions = vec![("ClusterName".to_string(), cluster)];
    let queries = vec![
        ecs_metric("cpu", "CPU %", "CPUUtilization", dimensions.clone()),
        ecs_metric("mem", "Memory %", "MemoryUtilization", dimensions),
    ];
    let (start, end) = window();
    cloudwatch(state.inner(), &scope)
        .await?
        .get_metric_data(&queries, start, end, PERIOD)
        .await
}
