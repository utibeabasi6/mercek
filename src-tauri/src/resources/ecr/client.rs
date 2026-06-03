use async_trait::async_trait;
use aws_sdk_ecr::types::ImageIdentifier;
use aws_sdk_ecr::Client;

use crate::domain::ImageScan;
use crate::error::AppResult;
use crate::resources::ecr::map;
use crate::resources::ecs::client::classify;

#[async_trait]
pub trait EcrApi: Send + Sync {
    /// Latest vuln-scan summary for one image. `reference` is a tag, or a
    /// `sha256:…` digest.
    async fn image_scan(&self, repository: &str, reference: &str) -> AppResult<ImageScan>;
}

pub struct SdkEcr {
    ecr: Client,
    profile: String,
}

impl SdkEcr {
    pub fn new(ecr: Client, profile: impl Into<String>) -> Self {
        Self { ecr, profile: profile.into() }
    }
}

#[async_trait]
impl EcrApi for SdkEcr {
    async fn image_scan(&self, repository: &str, reference: &str) -> AppResult<ImageScan> {
        let id = if reference.starts_with("sha256:") {
            ImageIdentifier::builder().image_digest(reference).build()
        } else {
            ImageIdentifier::builder().image_tag(reference).build()
        };
        let resp = self
            .ecr
            .describe_images()
            .repository_name(repository)
            .image_ids(id)
            .send()
            .await
            .map_err(|e| classify(&self.profile, e))?;
        Ok(map::image_scan(repository, reference, resp.image_details().first()))
    }
}

#[cfg(feature = "mock")]
pub struct MockEcr;

#[cfg(feature = "mock")]
#[async_trait]
impl EcrApi for MockEcr {
    async fn image_scan(&self, repository: &str, reference: &str) -> AppResult<ImageScan> {
        Ok(crate::mock::image_scan(repository, reference))
    }
}
