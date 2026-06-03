use async_trait::async_trait;
use aws_sdk_applicationautoscaling::types::ServiceNamespace;
use aws_sdk_applicationautoscaling::Client;

use crate::domain::ScalingView;
use crate::error::AppResult;
use crate::resources::autoscaling::map;
use crate::resources::ecs::client::classify;

#[async_trait]
pub trait AutoscalingApi: Send + Sync {
    async fn scaling(&self, resource_id: &str) -> AppResult<ScalingView>;
}

pub struct SdkAutoscaling {
    client: Client,
    profile: String,
}

impl SdkAutoscaling {
    pub fn new(client: Client, profile: impl Into<String>) -> Self {
        Self { client, profile: profile.into() }
    }
}

#[async_trait]
impl AutoscalingApi for SdkAutoscaling {
    async fn scaling(&self, resource_id: &str) -> AppResult<ScalingView> {
        let targets = self
            .client
            .describe_scalable_targets()
            .service_namespace(ServiceNamespace::Ecs)
            .resource_ids(resource_id)
            .send()
            .await
            .map_err(|e| classify(&self.profile, e))?;
        let policies = self
            .client
            .describe_scaling_policies()
            .service_namespace(ServiceNamespace::Ecs)
            .resource_id(resource_id)
            .send()
            .await
            .map_err(|e| classify(&self.profile, e))?;
        Ok(ScalingView {
            targets: targets.scalable_targets().iter().map(map::scalable_target).collect(),
            policies: policies.scaling_policies().iter().map(map::scaling_policy).collect(),
        })
    }
}

#[cfg(feature = "mock")]
pub struct MockAutoscaling;

#[cfg(feature = "mock")]
#[async_trait]
impl AutoscalingApi for MockAutoscaling {
    async fn scaling(&self, _resource_id: &str) -> AppResult<ScalingView> {
        Ok(crate::mock::scaling_view())
    }
}
