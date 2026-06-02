use async_trait::async_trait;
use aws_sdk_ecs::types::{
    ClusterField, ServiceField, SortOrder, TaskDefinitionFamilyStatus, TaskDefinitionStatus,
    TaskField,
};
use aws_sdk_ecs::Client;
use aws_smithy_types::error::metadata::ProvideErrorMetadata;

use crate::domain::{
    CapacityProvider, Cluster, ContainerInstance, Scope, Service, Task, TaskDefinition,
};
use crate::error::{AppError, AppResult};
use crate::resources::ecs::map;

#[async_trait]
pub trait EcsApi: Send + Sync {
    async fn list_clusters(&self) -> AppResult<Vec<String>>;
    async fn describe_clusters(&self, arns: &[String]) -> AppResult<Vec<Cluster>>;
    async fn list_services(&self, cluster: &str) -> AppResult<Vec<String>>;
    async fn describe_services(&self, cluster: &str, arns: &[String]) -> AppResult<Vec<Service>>;
    async fn list_tasks(&self, cluster: &str) -> AppResult<Vec<String>>;
    async fn describe_tasks(&self, cluster: &str, arns: &[String]) -> AppResult<Vec<Task>>;
    async fn list_container_instances(&self, cluster: &str) -> AppResult<Vec<String>>;
    async fn describe_container_instances(
        &self,
        cluster: &str,
        arns: &[String],
    ) -> AppResult<Vec<ContainerInstance>>;
    async fn describe_capacity_providers(&self) -> AppResult<Vec<CapacityProvider>>;
    async fn describe_task_definition(&self, arn: &str) -> AppResult<TaskDefinition>;
    /// Active task-definition ARNs for a family, newest revision first.
    async fn list_task_definitions(&self, family: &str) -> AppResult<Vec<String>>;
    /// Active task-definition family names.
    async fn list_task_def_families(&self) -> AppResult<Vec<String>>;
}

pub struct SdkEcs {
    ecs: Client,
    profile: String,
}

impl SdkEcs {
    pub fn new(ecs: Client, profile: impl Into<String>) -> Self {
        Self { ecs, profile: profile.into() }
    }

    fn err<E: ProvideErrorMetadata>(&self, e: E) -> AppError {
        classify(&self.profile, e)
    }
}

/// Map an AWS SDK error into a typed `AppError`, preserving the service's real
/// error code + message (via `ProvideErrorMetadata`) instead of the opaque
/// top-level "service error" string.
pub fn classify<E: ProvideErrorMetadata>(profile: &str, e: E) -> AppError {
    let code = e.code().unwrap_or_default().to_string();
    let message = e.message().unwrap_or_default().to_string();
    let probe = format!("{code} {message}").to_lowercase();

    // Genuine token expiry only — NOT invalid static credentials
    // (UnrecognizedClientException / InvalidClientTokenId / SignatureDoesNotMatch),
    // which fall through to a plain `Aws` error showing the real code + message.
    let expired = code.contains("ExpiredToken")
        || code == "InvalidGrantException"
        || probe.contains("token has expired")
        || (probe.contains("security token") && probe.contains("expired"))
        || probe.contains("sso session has expired");

    if expired {
        AppError::AuthExpired { profile: profile.to_string() }
    } else if code == "AccessDeniedException"
        || code == "AccessDenied"
        || code == "UnauthorizedException"
        || probe.contains("not authorized")
        || probe.contains("access denied")
    {
        AppError::Forbidden
    } else if code.contains("Throttl")
        || code == "RequestLimitExceeded"
        || probe.contains("rate exceeded")
    {
        crate::aws::retry::note_throttle();
        AppError::Throttled
    } else {
        AppError::Aws {
            service: "aws".into(),
            code: if code.is_empty() { "Unknown".into() } else { code },
            message: if message.is_empty() {
                "service error (no message returned)".into()
            } else {
                message
            },
        }
    }
}

const SERVICE_CHUNK: usize = 10;
const TASK_CHUNK: usize = 100;
const CLUSTER_CHUNK: usize = 100;

#[async_trait]
impl EcsApi for SdkEcs {
    async fn list_clusters(&self) -> AppResult<Vec<String>> {
        let mut arns = Vec::new();
        let mut next = None;
        loop {
            let resp = self
                .ecs
                .list_clusters()
                .set_next_token(next)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            arns.extend(resp.cluster_arns().iter().cloned());
            next = resp.next_token().map(String::from);
            if next.is_none() {
                break;
            }
        }
        Ok(arns)
    }

    async fn describe_clusters(&self, arns: &[String]) -> AppResult<Vec<Cluster>> {
        let mut out = Vec::new();
        for chunk in arns.chunks(CLUSTER_CHUNK) {
            let resp = self
                .ecs
                .describe_clusters()
                .set_clusters(Some(chunk.to_vec()))
                .set_include(Some(vec![
                    ClusterField::Settings,
                    ClusterField::Statistics,
                    ClusterField::Configurations,
                    ClusterField::Attachments,
                    ClusterField::Tags,
                ]))
                .send()
                .await
                .map_err(|e| self.err(e))?;
            out.extend(resp.clusters().iter().map(map::cluster));
        }
        Ok(out)
    }

    async fn list_services(&self, cluster: &str) -> AppResult<Vec<String>> {
        let mut arns = Vec::new();
        let mut next = None;
        loop {
            let resp = self
                .ecs
                .list_services()
                .cluster(cluster)
                .set_next_token(next)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            arns.extend(resp.service_arns().iter().cloned());
            next = resp.next_token().map(String::from);
            if next.is_none() {
                break;
            }
        }
        Ok(arns)
    }

    async fn describe_services(&self, cluster: &str, arns: &[String]) -> AppResult<Vec<Service>> {
        let mut out = Vec::new();
        for chunk in arns.chunks(SERVICE_CHUNK) {
            let resp = self
                .ecs
                .describe_services()
                .cluster(cluster)
                .set_services(Some(chunk.to_vec()))
                .include(ServiceField::Tags)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            out.extend(resp.services().iter().map(map::service));
        }
        Ok(out)
    }

    async fn list_tasks(&self, cluster: &str) -> AppResult<Vec<String>> {
        let mut arns = Vec::new();
        let mut next = None;
        loop {
            let resp = self
                .ecs
                .list_tasks()
                .cluster(cluster)
                .set_next_token(next)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            arns.extend(resp.task_arns().iter().cloned());
            next = resp.next_token().map(String::from);
            if next.is_none() {
                break;
            }
        }
        Ok(arns)
    }

    async fn describe_tasks(&self, cluster: &str, arns: &[String]) -> AppResult<Vec<Task>> {
        let mut out = Vec::new();
        for chunk in arns.chunks(TASK_CHUNK) {
            let resp = self
                .ecs
                .describe_tasks()
                .cluster(cluster)
                .set_tasks(Some(chunk.to_vec()))
                .include(TaskField::Tags)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            out.extend(resp.tasks().iter().map(map::task));
        }
        Ok(out)
    }

    async fn list_container_instances(&self, cluster: &str) -> AppResult<Vec<String>> {
        let mut arns = Vec::new();
        let mut next = None;
        loop {
            let resp = self
                .ecs
                .list_container_instances()
                .cluster(cluster)
                .set_next_token(next)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            arns.extend(resp.container_instance_arns().iter().cloned());
            next = resp.next_token().map(String::from);
            if next.is_none() {
                break;
            }
        }
        Ok(arns)
    }

    async fn describe_container_instances(
        &self,
        cluster: &str,
        arns: &[String],
    ) -> AppResult<Vec<ContainerInstance>> {
        let mut out = Vec::new();
        for chunk in arns.chunks(CLUSTER_CHUNK) {
            let resp = self
                .ecs
                .describe_container_instances()
                .cluster(cluster)
                .set_container_instances(Some(chunk.to_vec()))
                .send()
                .await
                .map_err(|e| self.err(e))?;
            out.extend(
                resp.container_instances()
                    .iter()
                    .map(|ci| map::container_instance(ci, cluster)),
            );
        }
        Ok(out)
    }

    async fn describe_capacity_providers(&self) -> AppResult<Vec<CapacityProvider>> {
        let resp = self
            .ecs
            .describe_capacity_providers()
            .send()
            .await
            .map_err(|e| self.err(e))?;
        Ok(resp.capacity_providers().iter().map(map::capacity_provider).collect())
    }

    async fn describe_task_definition(&self, arn: &str) -> AppResult<TaskDefinition> {
        let resp = self
            .ecs
            .describe_task_definition()
            .task_definition(arn)
            .send()
            .await
            .map_err(|e| self.err(e))?;
        resp.task_definition()
            .map(map::task_definition)
            .ok_or_else(|| AppError::NotFound { resource: arn.to_string() })
    }

    async fn list_task_definitions(&self, family: &str) -> AppResult<Vec<String>> {
        let mut arns = Vec::new();
        let mut next = None;
        loop {
            let resp = self
                .ecs
                .list_task_definitions()
                .family_prefix(family)
                .status(TaskDefinitionStatus::Active)
                .sort(SortOrder::Desc)
                .set_next_token(next)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            arns.extend(resp.task_definition_arns().iter().cloned());
            next = resp.next_token().map(String::from);
            if next.is_none() {
                break;
            }
        }
        Ok(arns)
    }

    async fn list_task_def_families(&self) -> AppResult<Vec<String>> {
        let mut families = Vec::new();
        let mut next = None;
        loop {
            let resp = self
                .ecs
                .list_task_definition_families()
                .status(TaskDefinitionFamilyStatus::Active)
                .set_next_token(next)
                .send()
                .await
                .map_err(|e| self.err(e))?;
            families.extend(resp.families().iter().cloned());
            next = resp.next_token().map(String::from);
            if next.is_none() {
                break;
            }
        }
        Ok(families)
    }
}

pub struct MockEcs {
    graph: crate::domain::ResourceGraph,
}

impl MockEcs {
    pub fn new(scope: &Scope) -> Self {
        Self { graph: crate::mock::discover(scope) }
    }

    pub fn account_id(&self) -> Option<String> {
        self.graph.account_id.clone()
    }
}

#[async_trait]
impl EcsApi for MockEcs {
    async fn list_clusters(&self) -> AppResult<Vec<String>> {
        Ok(self.graph.clusters.iter().map(|c| c.arn.clone()).collect())
    }

    async fn describe_clusters(&self, arns: &[String]) -> AppResult<Vec<Cluster>> {
        Ok(self
            .graph
            .clusters
            .iter()
            .filter(|c| arns.contains(&c.arn))
            .cloned()
            .collect())
    }

    async fn list_services(&self, cluster: &str) -> AppResult<Vec<String>> {
        Ok(self
            .graph
            .services
            .iter()
            .filter(|s| s.cluster == cluster)
            .map(|s| s.arn.clone())
            .collect())
    }

    async fn describe_services(&self, cluster: &str, arns: &[String]) -> AppResult<Vec<Service>> {
        Ok(self
            .graph
            .services
            .iter()
            .filter(|s| s.cluster == cluster && arns.contains(&s.arn))
            .cloned()
            .collect())
    }

    async fn list_tasks(&self, cluster: &str) -> AppResult<Vec<String>> {
        Ok(self
            .graph
            .tasks
            .iter()
            .filter(|t| t.cluster == cluster)
            .map(|t| t.arn.clone())
            .collect())
    }

    async fn describe_tasks(&self, cluster: &str, arns: &[String]) -> AppResult<Vec<Task>> {
        Ok(self
            .graph
            .tasks
            .iter()
            .filter(|t| t.cluster == cluster && arns.contains(&t.arn))
            .cloned()
            .collect())
    }

    async fn list_container_instances(&self, _cluster: &str) -> AppResult<Vec<String>> {
        Ok(Vec::new())
    }

    async fn describe_container_instances(
        &self,
        _cluster: &str,
        _arns: &[String],
    ) -> AppResult<Vec<ContainerInstance>> {
        Ok(Vec::new())
    }

    async fn describe_capacity_providers(&self) -> AppResult<Vec<CapacityProvider>> {
        Ok(self.graph.capacity_providers.clone())
    }

    async fn describe_task_definition(&self, arn: &str) -> AppResult<TaskDefinition> {
        self.graph
            .task_definitions
            .iter()
            .find(|t| t.arn == arn)
            .cloned()
            .ok_or_else(|| AppError::NotFound { resource: arn.to_string() })
    }

    async fn list_task_definitions(&self, family: &str) -> AppResult<Vec<String>> {
        Ok(self
            .graph
            .task_definitions
            .iter()
            .filter(|t| t.family == family)
            .map(|t| t.arn.clone())
            .collect())
    }

    async fn list_task_def_families(&self) -> AppResult<Vec<String>> {
        let mut families: Vec<String> =
            self.graph.task_definitions.iter().map(|t| t.family.clone()).collect();
        families.sort();
        families.dedup();
        Ok(families)
    }
}
