use aws_sdk_ecs::types::{KeyValuePair, Secret};
use aws_sdk_ecs::Client;

use crate::domain::{Cluster, Service, Task, TaskDefinition};
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

/// Per-container overrides for a one-off `RunTask` (e.g. run a migration with a custom
/// command and extra env, without touching the task definition).
pub struct RunOverride {
    pub container_name: String,
    pub command: Option<Vec<String>>,
    pub env: Vec<(String, String)>,
}

/// One container in a brand-new task definition (not derived from an existing revision).
pub struct NewContainer {
    pub name: String,
    pub image: String,
    pub cpu: Option<i32>,
    pub memory: Option<i32>,
    pub port: Option<i32>,
    pub command: Option<Vec<String>>,
    pub essential: bool,
    pub env: Vec<(String, String)>,
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

    register_from(client, profile, td, containers, cpu, memory).await
}

/// Register a new revision of `td`'s family with the given container definitions, copying
/// every task-level field (roles, network mode, volumes, runtime platform, …) from the
/// base. Shared by the targeted-edit register and the deploy-image flow.
async fn register_from(
    client: &Client,
    profile: &str,
    td: &aws_sdk_ecs::types::TaskDefinition,
    containers: Vec<aws_sdk_ecs::types::ContainerDefinition>,
    cpu: Option<String>,
    memory: Option<String>,
) -> AppResult<TaskDefinition> {
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

/// Deploy a new image to a service in one step: register a new task-def revision from the
/// service's current definition with only the target container's image swapped (env,
/// secrets, and everything else preserved), then point the service at the new revision.
pub async fn deploy_image(
    client: &Client,
    profile: &str,
    cluster: &str,
    service: &str,
    base_arn: &str,
    container_name: &str,
    image: &str,
) -> AppResult<Service> {
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
    let idx = containers
        .iter()
        .position(|c| c.name() == Some(container_name))
        .ok_or_else(|| AppError::NotFound { resource: container_name.to_string() })?;
    containers[idx] = clone_container_builder(&containers[idx]).image(image).build();

    let new_td = register_from(client, profile, td, containers, None, None).await?;
    update_service(client, profile, cluster, service, Some(new_td.arn), None, None).await
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

/// Turn on ECS Exec for a service and roll its tasks so the exec agent runs in them.
/// `enableExecuteCommand` only affects tasks started after it's set, so we also force a
/// new deployment to restart the existing tasks.
pub async fn enable_exec(
    client: &Client,
    profile: &str,
    cluster: &str,
    service: &str,
) -> AppResult<Service> {
    let resp = client
        .update_service()
        .cluster(cluster)
        .service(service)
        .enable_execute_command(true)
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
    overrides: Option<RunOverride>,
) -> AppResult<Vec<Task>> {
    use aws_sdk_ecs::types::{
        AssignPublicIp, AwsVpcConfiguration, ContainerOverride, LaunchType, NetworkConfiguration,
        TaskOverride,
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

    // Optional per-container overrides (command / extra env), e.g. a one-off migration.
    if let Some(ov) = overrides.filter(|o| {
        !o.container_name.is_empty()
            && (o.command.as_ref().is_some_and(|c| !c.is_empty()) || !o.env.is_empty())
    }) {
        let mut co = ContainerOverride::builder().name(ov.container_name);
        if let Some(cmd) = ov.command.filter(|c| !c.is_empty()) {
            co = co.set_command(Some(cmd));
        }
        if !ov.env.is_empty() {
            let env: Vec<KeyValuePair> = ov
                .env
                .into_iter()
                .map(|(k, v)| KeyValuePair::builder().name(k).value(v).build())
                .collect();
            co = co.set_environment(Some(env));
        }
        req = req.overrides(TaskOverride::builder().container_overrides(co.build()).build());
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

/// Register a brand-new task definition from explicit inputs — a new family, not a
/// revision of an existing one.
#[allow(clippy::too_many_arguments)]
pub async fn register_task_def(
    client: &Client,
    profile: &str,
    family: &str,
    network_mode: &str,
    requires_compatibilities: Vec<String>,
    cpu: Option<String>,
    memory: Option<String>,
    execution_role_arn: Option<String>,
    task_role_arn: Option<String>,
    containers: Vec<NewContainer>,
) -> AppResult<TaskDefinition> {
    use aws_sdk_ecs::types::{
        Compatibility, ContainerDefinition, NetworkMode, PortMapping, TransportProtocol,
    };

    let defs: Vec<ContainerDefinition> = containers
        .into_iter()
        .map(|c| {
            let mut b = ContainerDefinition::builder()
                .name(c.name)
                .image(c.image)
                .essential(c.essential)
                .set_memory(c.memory);
            if let Some(cpu) = c.cpu {
                b = b.cpu(cpu);
            }
            if let Some(port) = c.port {
                b = b.port_mappings(
                    PortMapping::builder()
                        .container_port(port)
                        .protocol(TransportProtocol::Tcp)
                        .build(),
                );
            }
            if let Some(cmd) = c.command.filter(|cmd| !cmd.is_empty()) {
                b = b.set_command(Some(cmd));
            }
            if !c.env.is_empty() {
                b = b.set_environment(Some(
                    c.env
                        .into_iter()
                        .map(|(k, v)| KeyValuePair::builder().name(k).value(v).build())
                        .collect(),
                ));
            }
            b.build()
        })
        .collect();

    let requires: Vec<Compatibility> = requires_compatibilities
        .iter()
        .map(|s| Compatibility::from(s.as_str()))
        .collect();

    let resp = client
        .register_task_definition()
        .family(family)
        .set_container_definitions(Some(defs))
        .network_mode(NetworkMode::from(network_mode))
        .set_requires_compatibilities(Some(requires))
        .set_cpu(cpu.filter(|s| !s.is_empty()))
        .set_memory(memory.filter(|s| !s.is_empty()))
        .set_execution_role_arn(execution_role_arn.filter(|s| !s.is_empty()))
        .set_task_role_arn(task_role_arn.filter(|s| !s.is_empty()))
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    resp.task_definition()
        .map(map::task_definition)
        .ok_or_else(|| AppError::internal("RegisterTaskDefinition returned no task definition"))
}

/// Create a new ECS cluster, optionally turning on Container Insights.
pub async fn create_cluster(
    client: &Client,
    profile: &str,
    name: &str,
    container_insights: bool,
) -> AppResult<Cluster> {
    use aws_sdk_ecs::types::{ClusterSetting, ClusterSettingName};
    let mut req = client.create_cluster().cluster_name(name);
    if container_insights {
        req = req.settings(
            ClusterSetting::builder()
                .name(ClusterSettingName::ContainerInsights)
                .value("enabled")
                .build(),
        );
    }
    let resp = req.send().await.map_err(|e| classify(profile, e))?;
    resp.cluster()
        .map(map::cluster)
        .ok_or_else(|| AppError::internal("CreateCluster returned no cluster"))
}

/// Create a new service via `CreateService`. `load_balancer` is
/// (target_group_arn, container_name, container_port) when the service sits behind a
/// target group. awsvpc networking is attached for Fargate or whenever subnets are given.
#[allow(clippy::too_many_arguments)]
pub async fn create_service(
    client: &Client,
    profile: &str,
    cluster: &str,
    name: &str,
    task_definition: &str,
    desired: i32,
    launch_type: &str,
    subnets: Vec<String>,
    security_groups: Vec<String>,
    assign_public_ip: bool,
    load_balancer: Option<(String, String, i32)>,
) -> AppResult<Service> {
    use aws_sdk_ecs::types::{
        AssignPublicIp, AwsVpcConfiguration, LaunchType, LoadBalancer, NetworkConfiguration,
    };

    let lt = match launch_type {
        "EC2" => LaunchType::Ec2,
        "EXTERNAL" => LaunchType::External,
        _ => LaunchType::Fargate,
    };
    let mut req = client
        .create_service()
        .cluster(cluster)
        .service_name(name)
        .task_definition(task_definition)
        .desired_count(desired)
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

    if let Some((target_group_arn, container_name, container_port)) = load_balancer {
        req = req.load_balancers(
            LoadBalancer::builder()
                .target_group_arn(target_group_arn)
                .container_name(container_name)
                .container_port(container_port)
                .build(),
        );
    }

    let resp = req.send().await.map_err(|e| classify(profile, e))?;
    resp.service()
        .map(map::service)
        .ok_or_else(|| AppError::internal("CreateService returned no service"))
}

/// Delete a service. `force` deletes it even with running tasks (ECS otherwise requires
/// the desired count to be 0 first). Returns the service in its terminating state.
pub async fn delete_service(
    client: &Client,
    profile: &str,
    cluster: &str,
    service: &str,
    force: bool,
) -> AppResult<Service> {
    let resp = client
        .delete_service()
        .cluster(cluster)
        .service(service)
        .force(force)
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    resp.service()
        .map(map::service)
        .ok_or_else(|| AppError::internal("DeleteService returned no service"))
}

/// Delete a cluster. ECS rejects this unless the cluster has no active services, running
/// tasks, or container instances — that error is surfaced to the user as-is.
pub async fn delete_cluster(client: &Client, profile: &str, cluster: &str) -> AppResult<()> {
    client
        .delete_cluster()
        .cluster(cluster)
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    Ok(())
}

/// Deregister a task-definition revision (marks it INACTIVE). Tasks already running on it
/// keep running; it just can't start new ones.
pub async fn deregister_task_def(client: &Client, profile: &str, arn: &str) -> AppResult<()> {
    client
        .deregister_task_definition()
        .task_definition(arn)
        .send()
        .await
        .map_err(|e| classify(profile, e))?;
    Ok(())
}
