use tauri::State;

use crate::aws::profiles;
use crate::domain::{AwsProfile, Scope};
use crate::error::AppResult;
use crate::state::AppState;

pub fn use_mock() -> bool {
    std::env::var("MERCEK_MOCK").is_ok()
}

#[tauri::command]
pub fn list_profiles() -> AppResult<Vec<AwsProfile>> {
    if use_mock() {
        Ok(crate::mock::profiles())
    } else {
        Ok(profiles::discover_profiles())
    }
}

#[tauri::command]
pub fn get_scopes(state: State<'_, AppState>) -> AppResult<Vec<Scope>> {
    state.store.get_scopes()
}

#[tauri::command]
pub fn set_scopes(state: State<'_, AppState>, scopes: Vec<Scope>) -> AppResult<()> {
    state.store.set_scopes(&scopes)
}
