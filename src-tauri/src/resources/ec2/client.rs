use async_trait::async_trait;
use aws_sdk_ec2::Client;

use crate::domain::{EniDetail, NetworkOptions};
use crate::error::{AppError, AppResult};
use crate::resources::ec2::map;
use crate::resources::ecs::client::classify;

#[async_trait]
pub trait Ec2Api: Send + Sync {
    async fn describe_eni(&self, eni_id: &str) -> AppResult<EniDetail>;
    /// Every VPC / subnet / security group in the region, for the awsvpc network pickers.
    async fn network_options(&self) -> AppResult<NetworkOptions>;
}

pub struct SdkEc2 {
    ec2: Client,
    profile: String,
}

impl SdkEc2 {
    pub fn new(ec2: Client, profile: impl Into<String>) -> Self {
        Self { ec2, profile: profile.into() }
    }
}

#[async_trait]
impl Ec2Api for SdkEc2 {
    async fn describe_eni(&self, eni_id: &str) -> AppResult<EniDetail> {
        let resp = self
            .ec2
            .describe_network_interfaces()
            .network_interface_ids(eni_id)
            .send()
            .await
            .map_err(|e| classify(&self.profile, e))?;
        resp.network_interfaces()
            .first()
            .map(map::eni)
            .ok_or_else(|| AppError::NotFound { resource: eni_id.to_string() })
    }

    async fn network_options(&self) -> AppResult<NetworkOptions> {
        let (vpcs, subnets, groups) = tokio::join!(
            self.ec2.describe_vpcs().send(),
            self.ec2.describe_subnets().send(),
            self.ec2.describe_security_groups().send(),
        );
        let vpcs = vpcs.map_err(|e| classify(&self.profile, e))?;
        let subnets = subnets.map_err(|e| classify(&self.profile, e))?;
        let groups = groups.map_err(|e| classify(&self.profile, e))?;
        Ok(NetworkOptions {
            vpcs: vpcs.vpcs().iter().map(map::vpc).collect(),
            subnets: subnets.subnets().iter().map(map::subnet).collect(),
            security_groups: groups.security_groups().iter().map(map::security_group).collect(),
        })
    }
}

#[cfg(feature = "mock")]
pub struct MockEc2;

#[cfg(feature = "mock")]
#[async_trait]
impl Ec2Api for MockEc2 {
    async fn describe_eni(&self, eni_id: &str) -> AppResult<EniDetail> {
        Ok(crate::mock::eni_detail(eni_id))
    }

    async fn network_options(&self) -> AppResult<NetworkOptions> {
        Ok(crate::mock::network_options())
    }
}
