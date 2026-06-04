use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::domain::{MetricSeries, Scope};
use crate::error::AppResult;
use crate::resources::cloudwatch::{CloudwatchApi, MetricQuery};
use crate::state::AppState;

fn window(range_secs: i64) -> (i64, i64) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    (now - range_secs.max(60), now)
}

/// Scale the CloudWatch period to the window so we return a sensible number of points
/// regardless of range (1-min for short windows, up to 1-hour for a week). Each value
/// is a valid CloudWatch period (multiple of 60).
fn period_for(range_secs: i64) -> i32 {
    match range_secs {
        r if r <= 3 * 3600 => 60,    // <= 3h  -> 1-minute
        r if r <= 12 * 3600 => 300,  // <= 12h -> 5-minute
        r if r <= 2 * 86400 => 900,  // <= 2d  -> 15-minute
        _ => 3600,                   // longer -> 1-hour
    }
}

async fn cloudwatch(state: &AppState, scope: &Scope) -> AppResult<Arc<dyn CloudwatchApi>> {
    Ok(state.pool.get(scope).await?.cloudwatch.clone())
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
    range_secs: i64,
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
    let (start, end) = window(range_secs);
    cloudwatch(state.inner(), &scope)
        .await?
        .get_metric_data(&queries, start, end, period_for(range_secs))
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
    range_secs: i64,
) -> AppResult<Vec<MetricSeries>> {
    let elb = state.pool.get(&scope).await?.elb.clone();
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

    let (start, end) = window(range_secs);
    cloudwatch(state.inner(), &scope)
        .await?
        .get_metric_data(&queries, start, end, period_for(range_secs))
        .await
}

#[tauri::command]
pub async fn cluster_metrics(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    container_insights: bool,
    range_secs: i64,
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
    let (start, end) = window(range_secs);
    cloudwatch(state.inner(), &scope)
        .await?
        .get_metric_data(&queries, start, end, period_for(range_secs))
        .await
}
