use std::sync::Arc;

use tauri::State;

use crate::commands::profiles::use_mock;
use crate::domain::{EniDetail, Scope};
use crate::error::AppResult;
use crate::resources::ec2::{Ec2Api, MockEc2};
use crate::state::AppState;

#[tauri::command]
pub async fn describe_eni(
    state: State<'_, AppState>,
    scope: Scope,
    eni_id: String,
) -> AppResult<EniDetail> {
    let api: Arc<dyn Ec2Api> = if use_mock() {
        Arc::new(MockEc2)
    } else {
        state.pool.get(&scope).await?.ec2.clone()
    };
    api.describe_eni(&eni_id).await
}
