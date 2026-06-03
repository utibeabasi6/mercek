use async_trait::async_trait;
use aws_sdk_elasticloadbalancingv2::Client;

use crate::domain::TargetHealth;
use crate::error::AppResult;
use crate::resources::ecs::client::classify;
use crate::resources::elb::map;

#[async_trait]
pub trait ElbApi: Send + Sync {
    async fn describe_target_health(&self, target_group_arn: &str) -> AppResult<Vec<TargetHealth>>;
    /// The first load-balancer ARN a target group is attached to (for ALB metric dimensions).
    async fn target_group_lb_arn(&self, target_group_arn: &str) -> AppResult<Option<String>>;
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

    async fn target_group_lb_arn(&self, target_group_arn: &str) -> AppResult<Option<String>> {
        let resp = self
            .elb
            .describe_target_groups()
            .target_group_arns(target_group_arn)
            .send()
            .await
            .map_err(|e| classify(&self.profile, e))?;
        Ok(resp
            .target_groups()
            .first()
            .and_then(|t| t.load_balancer_arns().first().cloned()))
    }
}

#[cfg(feature = "mock")]
pub struct MockElb;

#[cfg(feature = "mock")]
#[async_trait]
impl ElbApi for MockElb {
    async fn describe_target_health(&self, _target_group_arn: &str) -> AppResult<Vec<TargetHealth>> {
        Ok(crate::mock::target_health())
    }

    async fn target_group_lb_arn(&self, _target_group_arn: &str) -> AppResult<Option<String>> {
        Ok(Some(
            "arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/app/mercek-alb/50dc6c495c0c9188"
                .to_string(),
        ))
    }
}
