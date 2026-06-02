use aws_config::BehaviorVersion;
use aws_sdk_ecs::config::Region;

use crate::aws::retry::retry_config;
use crate::error::{AppError, AppResult};
use crate::resources::ecs::client::classify;

pub async fn load_config(profile: &str, region: &str) -> aws_config::SdkConfig {
    aws_config::defaults(BehaviorVersion::latest())
        .profile_name(profile)
        .region(Region::new(region.to_string()))
        .retry_config(retry_config())
        .load()
        .await
}

pub async fn caller_account(config: &aws_config::SdkConfig, profile: &str) -> AppResult<String> {
    let sts = aws_sdk_sts::Client::new(config);
    let out = sts
        .get_caller_identity()
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    out.account()
        .map(String::from)
        .ok_or_else(|| AppError::internal("STS GetCallerIdentity returned no account id"))
}
