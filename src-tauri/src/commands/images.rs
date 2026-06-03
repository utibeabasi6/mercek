use tauri::State;

use crate::domain::{ImageScan, Scope};
use crate::error::AppResult;
use crate::state::AppState;

/// The latest ECR vuln-scan summary for one container image (read-only).
#[tauri::command]
pub async fn image_scan(
    state: State<'_, AppState>,
    scope: Scope,
    repository: String,
    reference: String,
) -> AppResult<ImageScan> {
    let ecr = state.pool.get(&scope).await?.ecr.clone();
    ecr.image_scan(&repository, &reference).await
}
