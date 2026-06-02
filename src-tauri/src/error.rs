use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, thiserror::Error, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum AppError {
    #[error("AWS request was throttled")]
    Throttled,
    #[error("credentials expired or invalid for profile {profile}")]
    AuthExpired { profile: String },
    #[error("access denied")]
    Forbidden,
    #[error("not found: {resource}")]
    NotFound { resource: String },
    #[error("{service} returned {code}: {message}")]
    Aws {
        service: String,
        code: String,
        message: String,
    },
    #[error("internal error: {message}")]
    Internal { message: String },
}

impl AppError {
    pub fn internal(message: impl Into<String>) -> Self {
        AppError::Internal {
            message: message.into(),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal {
            message: err.to_string(),
        }
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;
