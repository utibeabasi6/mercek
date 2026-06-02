use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::commands::profiles::use_mock;
use crate::domain::{MetricSeries, Scope};
use crate::error::AppResult;
use crate::resources::cloudwatch::{CloudwatchApi, MetricQuery, MockCloudwatch};
use crate::resources::elb::{ElbApi, MockElb};
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

fn metric(
    namespace: &str,
    id: &str,
    label: &str,
    metric: &str,
    dimensions: Vec<(String, String)>,
) -> MetricQuery {
    MetricQuery {
        id: id.to_string(),
        label: label.to_string(),
        namespace: namespace.to_string(),
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
    container_insights: bool,
) -> AppResult<Vec<MetricSeries>> {
    let dims = vec![
        ("ClusterName".to_string(), cluster),
        ("ServiceName".to_string(), service),
    ];
    // Container Insights (ECS/ContainerInsights) is richer; fall back to base AWS/ECS.
    let queries = if container_insights {
        vec![
            metric("ECS/ContainerInsights", "cpu", "CPU (units)", "CpuUtilized", dims.clone()),
            metric("ECS/ContainerInsights", "mem", "Memory (MiB)", "MemoryUtilized", dims.clone()),
            metric("ECS/ContainerInsights", "tasks", "Running tasks", "RunningTaskCount", dims),
        ]
    } else {
        vec![
            metric("AWS/ECS", "cpu", "CPU %", "CPUUtilization", dims.clone()),
            metric("AWS/ECS", "mem", "Memory %", "MemoryUtilization", dims),
        ]
    };
    let (start, end) = window();
    cloudwatch(state.inner(), &scope)
        .await?
        .get_metric_data(&queries, start, end, PERIOD)
        .await
}

/// CloudWatch dimension value for an ALB resource ARN — the part after the account id.
fn arn_resource(arn: &str) -> Option<String> {
    arn.split(':').nth(5).map(str::to_string)
}

#[tauri::command]
pub async fn alb_metrics(
    state: State<'_, AppState>,
    scope: Scope,
    target_group_arn: String,
) -> AppResult<Vec<MetricSeries>> {
    let elb: Arc<dyn ElbApi> = if use_mock() {
        Arc::new(MockElb)
    } else {
        state.pool.get(&scope).await?.elb.clone()
    };
    let lb_arn = elb.target_group_lb_arn(&target_group_arn).await?;

    let mut dimensions = Vec::new();
    if let Some(lb) = lb_arn
        .as_deref()
        .and_then(arn_resource)
        .and_then(|r| r.strip_prefix("loadbalancer/").map(str::to_string))
    {
        dimensions.push(("LoadBalancer".to_string(), lb));
    }
    if let Some(tg) = arn_resource(&target_group_arn) {
        dimensions.push(("TargetGroup".to_string(), tg));
    }

    let alb = |id: &str, label: &str, metric: &str, stat: &str| MetricQuery {
        id: id.to_string(),
        label: label.to_string(),
        namespace: "AWS/ApplicationELB".to_string(),
        metric_name: metric.to_string(),
        dimensions: dimensions.clone(),
        stat: stat.to_string(),
    };
    let queries = vec![
        alb("req", "Requests", "RequestCount", "Sum"),
        alb("lat", "Target response (s)", "TargetResponseTime", "Average"),
        alb("5xx", "Target 5xx", "HTTPCode_Target_5XX_Count", "Sum"),
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
    container_insights: bool,
) -> AppResult<Vec<MetricSeries>> {
    let dims = vec![("ClusterName".to_string(), cluster)];
    let queries = if container_insights {
        vec![
            metric("ECS/ContainerInsights", "cpu", "CPU (units)", "CpuUtilized", dims.clone()),
            metric("ECS/ContainerInsights", "mem", "Memory (MiB)", "MemoryUtilized", dims.clone()),
            metric("ECS/ContainerInsights", "tasks", "Running tasks", "RunningTaskCount", dims),
        ]
    } else {
        vec![
            metric("AWS/ECS", "cpu", "CPU %", "CPUUtilization", dims.clone()),
            metric("AWS/ECS", "mem", "Memory %", "MemoryUtilization", dims),
        ]
    };
    let (start, end) = window();
    cloudwatch(state.inner(), &scope)
        .await?
        .get_metric_data(&queries, start, end, PERIOD)
        .await
}
