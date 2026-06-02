use aws_sdk_ecs::types::{KeyValuePair, Secret};
use aws_sdk_ecs::Client;

use crate::domain::{Service, Task, TaskDefinition};
use crate::error::{AppError, AppResult};
use crate::resources::ecs::client::classify;
use crate::resources::ecs::map;

/// Edits applied to one container when registering a new task-definition revision.
pub struct ContainerEdit {
    pub container_name: String,
    pub image: Option<String>,
    pub env: Vec<(String, String)>,
    pub secrets: Vec<(String, String)>,
}

/// Register a new task-def revision from an existing one. All fields are copied
/// verbatim from the base revision (reusing the SDK objects, so nothing is
/// dropped); only the targeted container's image/env/secrets and the task-level
/// cpu/memory are overridden.
pub async fn register_revision(
    client: &Client,
    profile: &str,
    base_arn: &str,
    edit: ContainerEdit,
    cpu: Option<String>,
    memory: Option<String>,
) -> AppResult<TaskDefinition> {
    let desc = client
        .describe_task_definition()
        .task_definition(base_arn)
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    let td = desc
        .task_definition()
        .ok_or_else(|| AppError::NotFound { resource: base_arn.to_string() })?;

    let mut containers = td.container_definitions().to_vec();
    if let Some(idx) = containers
        .iter()
        .position(|c| c.name() == Some(edit.container_name.as_str()))
    {
        let mut builder = clone_container_builder(&containers[idx]);
        if let Some(image) = edit.image {
            builder = builder.image(image);
        }
        let env: Vec<KeyValuePair> = edit
            .env
            .into_iter()
            .map(|(k, v)| KeyValuePair::builder().name(k).value(v).build())
            .collect();
        builder = builder.set_environment(Some(env));
        let secrets: Vec<Secret> = edit
            .secrets
            .into_iter()
            .map(|(name, value_from)| Secret::builder().name(name).value_from(value_from).build())
            .collect::<Result<_, _>>()
            .map_err(|e| AppError::internal(e.to_string()))?;
        builder = builder.set_secrets(Some(secrets));
        containers[idx] = builder.build();
    }

    let resp = client
        .register_task_definition()
        .family(td.family().unwrap_or_default())
        .set_container_definitions(Some(containers))
        .set_task_role_arn(td.task_role_arn().map(String::from))
        .set_execution_role_arn(td.execution_role_arn().map(String::from))
        .set_network_mode(td.network_mode().cloned())
        .set_requires_compatibilities(Some(td.requires_compatibilities().to_vec()))
        .set_volumes(Some(td.volumes().to_vec()))
        .set_placement_constraints(Some(td.placement_constraints().to_vec()))
        .set_runtime_platform(td.runtime_platform().cloned())
        .set_proxy_configuration(td.proxy_configuration().cloned())
        .set_ipc_mode(td.ipc_mode().cloned())
        .set_pid_mode(td.pid_mode().cloned())
        .set_ephemeral_storage(td.ephemeral_storage().cloned())
        .set_cpu(cpu.or_else(|| td.cpu().map(String::from)))
        .set_memory(memory.or_else(|| td.memory().map(String::from)))
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    resp.task_definition()
        .map(map::task_definition)
        .ok_or_else(|| AppError::internal("RegisterTaskDefinition returned no task definition"))
}

/// Copy every field of an existing container definition into a fresh builder so a
/// new revision can override a few fields without dropping the rest.
fn clone_container_builder(
    c: &aws_sdk_ecs::types::ContainerDefinition,
) -> aws_sdk_ecs::types::builders::ContainerDefinitionBuilder {
    aws_sdk_ecs::types::ContainerDefinition::builder()
        .set_name(c.name().map(String::from))
        .set_image(c.image().map(String::from))
        .set_repository_credentials(c.repository_credentials().cloned())
        .set_cpu(Some(c.cpu()))
        .set_memory(c.memory())
        .set_memory_reservation(c.memory_reservation())
        .set_links(Some(c.links().to_vec()))
        .set_port_mappings(Some(c.port_mappings().to_vec()))
        .set_essential(c.essential())
        .set_entry_point(Some(c.entry_point().to_vec()))
        .set_command(Some(c.command().to_vec()))
        .set_environment(Some(c.environment().to_vec()))
        .set_environment_files(Some(c.environment_files().to_vec()))
        .set_mount_points(Some(c.mount_points().to_vec()))
        .set_volumes_from(Some(c.volumes_from().to_vec()))
        .set_linux_parameters(c.linux_parameters().cloned())
        .set_secrets(Some(c.secrets().to_vec()))
        .set_depends_on(Some(c.depends_on().to_vec()))
        .set_start_timeout(c.start_timeout())
        .set_stop_timeout(c.stop_timeout())
        .set_hostname(c.hostname().map(String::from))
        .set_user(c.user().map(String::from))
        .set_working_directory(c.working_directory().map(String::from))
        .set_disable_networking(c.disable_networking())
        .set_privileged(c.privileged())
        .set_readonly_root_filesystem(c.readonly_root_filesystem())
        .set_dns_servers(Some(c.dns_servers().to_vec()))
        .set_dns_search_domains(Some(c.dns_search_domains().to_vec()))
        .set_extra_hosts(Some(c.extra_hosts().to_vec()))
        .set_docker_security_options(Some(c.docker_security_options().to_vec()))
        .set_interactive(c.interactive())
        .set_pseudo_terminal(c.pseudo_terminal())
        .set_docker_labels(c.docker_labels().cloned())
        .set_ulimits(Some(c.ulimits().to_vec()))
        .set_log_configuration(c.log_configuration().cloned())
        .set_health_check(c.health_check().cloned())
        .set_system_controls(Some(c.system_controls().to_vec()))
        .set_resource_requirements(Some(c.resource_requirements().to_vec()))
        .set_firelens_configuration(c.firelens_configuration().cloned())
        .set_credential_specs(Some(c.credential_specs().to_vec()))
        .set_restart_policy(c.restart_policy().cloned())
}

/// Set a service's desired task count via `UpdateService`, returning the updated service.
/// Write path: always uses the real SDK client (never a mock).
pub async fn update_service_desired(
    client: &Client,
    profile: &str,
    cluster: &str,
    service: &str,
    desired: i32,
) -> AppResult<Service> {
    let resp = client
        .update_service()
        .cluster(cluster)
        .service(service)
        .desired_count(desired)
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    resp.service()
        .map(map::service)
        .ok_or_else(|| AppError::internal("UpdateService returned no service"))
}

/// Update a service's task-definition revision and/or deployment configuration
/// (minimum healthy percent, maximum percent) via `UpdateService`.
pub async fn update_service(
    client: &Client,
    profile: &str,
    cluster: &str,
    service: &str,
    task_definition: Option<String>,
    minimum_healthy_percent: Option<i32>,
    maximum_percent: Option<i32>,
) -> AppResult<Service> {
    let mut req = client.update_service().cluster(cluster).service(service);
    if let Some(td) = task_definition {
        req = req.task_definition(td);
    }
    if minimum_healthy_percent.is_some() || maximum_percent.is_some() {
        let config = aws_sdk_ecs::types::DeploymentConfiguration::builder()
            .set_minimum_healthy_percent(minimum_healthy_percent)
            .set_maximum_percent(maximum_percent)
            .build();
        req = req.deployment_configuration(config);
    }
    let resp = req.send().await.map_err(|e| classify(profile, e))?;
    resp.service()
        .map(map::service)
        .ok_or_else(|| AppError::internal("UpdateService returned no service"))
}

/// Force a new deployment (rolling restart) via `UpdateService`.
pub async fn force_new_deployment(
    client: &Client,
    profile: &str,
    cluster: &str,
    service: &str,
) -> AppResult<Service> {
    let resp = client
        .update_service()
        .cluster(cluster)
        .service(service)
        .force_new_deployment(true)
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    resp.service()
        .map(map::service)
        .ok_or_else(|| AppError::internal("UpdateService returned no service"))
}

/// Run a one-off task via `RunTask`, returning the started tasks.
#[allow(clippy::too_many_arguments)]
pub async fn run_task(
    client: &Client,
    profile: &str,
    cluster: &str,
    task_definition: &str,
    count: i32,
    launch_type: &str,
    subnets: Vec<String>,
    security_groups: Vec<String>,
    assign_public_ip: bool,
) -> AppResult<Vec<Task>> {
    use aws_sdk_ecs::types::{
        AssignPublicIp, AwsVpcConfiguration, LaunchType, NetworkConfiguration,
    };

    let lt = match launch_type {
        "EC2" => LaunchType::Ec2,
        "EXTERNAL" => LaunchType::External,
        _ => LaunchType::Fargate,
    };
    let mut req = client
        .run_task()
        .cluster(cluster)
        .task_definition(task_definition)
        .count(count.max(1))
        .launch_type(lt.clone());

    if matches!(lt, LaunchType::Fargate) || !subnets.is_empty() {
        let awsvpc = AwsVpcConfiguration::builder()
            .set_subnets(Some(subnets))
            .set_security_groups((!security_groups.is_empty()).then_some(security_groups))
            .assign_public_ip(if assign_public_ip {
                AssignPublicIp::Enabled
            } else {
                AssignPublicIp::Disabled
            })
            .build()
            .map_err(|e| AppError::internal(e.to_string()))?;
        req = req.network_configuration(
            NetworkConfiguration::builder().awsvpc_configuration(awsvpc).build(),
        );
    }

    let resp = req.send().await.map_err(|e| classify(profile, e))?;
    Ok(resp.tasks().iter().map(map::task).collect())
}

/// Stop a running task via `StopTask`, returning the stopping task.
pub async fn stop_task(
    client: &Client,
    profile: &str,
    cluster: &str,
    task: &str,
    reason: Option<String>,
) -> AppResult<Task> {
    let mut req = client.stop_task().cluster(cluster).task(task);
    if let Some(reason) = reason.filter(|r| !r.is_empty()) {
        req = req.reason(reason);
    }
    let resp = req.send().await.map_err(|e| classify(profile, e))?;
    resp.task()
        .map(map::task)
        .ok_or_else(|| AppError::internal("StopTask returned no task"))
}
