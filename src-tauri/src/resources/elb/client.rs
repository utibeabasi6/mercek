use async_trait::async_trait;
use aws_sdk_elasticloadbalancingv2::Client;

use crate::domain::TargetHealth;
use crate::error::AppResult;
use crate::resources::ecs::client::classify;
use crate::resources::elb::map;

#[async_trait]
pub trait ElbApi: Send + Sync {
    async fn describe_target_health(&self, target_group_arn: &str) -> AppResult<Vec<TargetHealth>>;
}

pub struct SdkElb {
    elb: Client,
    profile: String,
}

impl SdkElb {
    pub fn new(elb: Client, profile: impl Into<String>) -> Self {
        Self { elb, profile: profile.into() }
    }
}

#[async_trait]
impl ElbApi for SdkElb {
    async fn describe_target_health(&self, target_group_arn: &str) -> AppResult<Vec<TargetHealth>> {
        let resp = self
            .elb
            .describe_target_health()
            .target_group_arn(target_group_arn)
            .send()
            .await
            .map_err(|e| classify(&self.profile, e))?;
        Ok(resp.target_health_descriptions().iter().map(map::target_health).collect())
    }
}

pub struct MockElb;

#[async_trait]
impl ElbApi for MockElb {
    async fn describe_target_health(&self, _target_group_arn: &str) -> AppResult<Vec<TargetHealth>> {
        Ok(crate::mock::target_health())
    }
}
