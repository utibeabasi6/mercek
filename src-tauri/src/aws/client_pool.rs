use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::aws::credentials;
use crate::domain::Scope;
use crate::error::AppResult;
use crate::resources::autoscaling::{AutoscalingApi, SdkAutoscaling};
use crate::resources::cloudwatch::{CloudwatchApi, SdkCloudwatch};
use crate::resources::ec2::{Ec2Api, SdkEc2};
use crate::resources::ecs::{EcsApi, SdkEcs};
use crate::resources::elb::{ElbApi, SdkElb};
use crate::resources::logs::{LogsApi, SdkLogs};

pub struct ScopeClients {
    pub ecs: Arc<dyn EcsApi>,
    pub elb: Arc<dyn ElbApi>,
    pub autoscaling: Arc<dyn AutoscalingApi>,
    pub cloudwatch: Arc<dyn CloudwatchApi>,
    pub logs: Arc<dyn LogsApi>,
    pub ec2: Arc<dyn Ec2Api>,
    pub account_id: Option<String>,
}

#[derive(Default)]
pub struct ClientPool {
    cache: Mutex<HashMap<Scope, Arc<ScopeClients>>>,
}

impl ClientPool {
    pub async fn get(&self, scope: &Scope) -> AppResult<Arc<ScopeClients>> {
        if let Some(clients) = self.cache.lock().await.get(scope) {
            return Ok(clients.clone());
        }

        let config = credentials::load_config(&scope.profile, &scope.region).await;
        let account_id = credentials::caller_account(&config, &scope.profile).await.ok();

        let clients = Arc::new(ScopeClients {
            ecs: Arc::new(SdkEcs::new(aws_sdk_ecs::Client::new(&config), scope.profile.clone())),
            elb: Arc::new(SdkElb::new(
                aws_sdk_elasticloadbalancingv2::Client::new(&config),
                scope.profile.clone(),
            )),
            autoscaling: Arc::new(SdkAutoscaling::new(
                aws_sdk_applicationautoscaling::Client::new(&config),
                scope.profile.clone(),
            )),
            cloudwatch: Arc::new(SdkCloudwatch::new(
                aws_sdk_cloudwatch::Client::new(&config),
                scope.profile.clone(),
            )),
            logs: Arc::new(SdkLogs::new(
                aws_sdk_cloudwatchlogs::Client::new(&config),
                scope.profile.clone(),
            )),
            ec2: Arc::new(SdkEc2::new(aws_sdk_ec2::Client::new(&config), scope.profile.clone())),
            account_id,
        });
        self.cache.lock().await.insert(scope.clone(), clients.clone());
        Ok(clients)
    }
}
