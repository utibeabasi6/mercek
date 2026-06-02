use std::collections::HashMap;
use std::time::SystemTime;

use aws_sdk_ecs::types as ecs;
use aws_smithy_types::date_time::Format;

use crate::domain;

fn os(v: Option<&str>) -> Option<String> {
    v.map(str::to_string)
}

fn ss(v: Option<&str>) -> String {
    v.unwrap_or_default().to_string()
}

fn dt(v: Option<&aws_smithy_types::DateTime>) -> Option<String> {
    v.and_then(|d| d.fmt(Format::DateTime).ok())
}

fn nn(v: i32) -> u32 {
    v.max(0) as u32
}

pub fn now_iso() -> String {
    aws_smithy_types::DateTime::from(SystemTime::now())
        .fmt(Format::DateTime)
        .unwrap_or_default()
}

fn tag(t: &ecs::Tag) -> domain::Tag {
    domain::Tag {
        key: os(t.key()),
        value: os(t.value()),
    }
}

fn kvp(p: &ecs::KeyValuePair) -> domain::KeyValuePair {
    domain::KeyValuePair {
        name: os(p.name()),
        value: os(p.value()),
    }
}

fn attribute(a: &ecs::Attribute) -> domain::Attribute {
    domain::Attribute {
        name: a.name().to_string(),
        value: os(a.value()),
        target_type: a.target_type().map(|t| t.as_str().to_string()),
        target_id: os(a.target_id()),
    }
}

fn attachment(a: &ecs::Attachment) -> domain::Attachment {
    domain::Attachment {
        id: os(a.id()),
        kind: os(a.r#type()),
        status: os(a.status()),
        details: a.details().iter().map(kvp).collect(),
    }
}

fn cps_item(i: &ecs::CapacityProviderStrategyItem) -> domain::CapacityProviderStrategyItem {
    domain::CapacityProviderStrategyItem {
        capacity_provider: i.capacity_provider().to_string(),
        weight: nn(i.weight()),
        base: nn(i.base()),
    }
}

fn placement_constraint(c: &ecs::PlacementConstraint) -> domain::PlacementConstraint {
    domain::PlacementConstraint {
        kind: c.r#type().map(|t| t.as_str().to_string()),
        expression: os(c.expression()),
    }
}

fn placement_strategy(s: &ecs::PlacementStrategy) -> domain::PlacementStrategy {
    domain::PlacementStrategy {
        kind: s.r#type().map(|t| t.as_str().to_string()),
        field: os(s.field()),
    }
}

fn network_configuration(n: &ecs::NetworkConfiguration) -> domain::NetworkConfiguration {
    domain::NetworkConfiguration {
        awsvpc_configuration: n.awsvpc_configuration().map(|v| domain::AwsVpcConfiguration {
            subnets: v.subnets().to_vec(),
            security_groups: v.security_groups().to_vec(),
            assign_public_ip: v.assign_public_ip().map(|a| a.as_str().to_string()),
        }),
    }
}

pub fn cluster(c: &ecs::Cluster) -> domain::Cluster {
    let active_services = nn(c.active_services_count());
    let running = nn(c.running_tasks_count());
    let pending = nn(c.pending_tasks_count());
    let instances = nn(c.registered_container_instances_count());
    domain::Cluster {
        arn: ss(c.cluster_arn()),
        name: ss(c.cluster_name()),
        status: ss(c.status()),
        registered_container_instances_count: instances,
        running_tasks_count: running,
        pending_tasks_count: pending,
        active_services_count: active_services,
        statistics: c.statistics().iter().map(kvp).collect(),
        tags: c.tags().iter().map(tag).collect(),
        settings: domain::ClusterSettings {
            container_insights: container_insights(c.settings()),
        },
        capacity_providers: c.capacity_providers().to_vec(),
        default_strategy: c.default_capacity_provider_strategy().iter().map(cps_item).collect(),
        attachments: c.attachments().iter().map(attachment).collect(),
        attachments_status: os(c.attachments_status()),
        service_connect_defaults: c
            .service_connect_defaults()
            .map(|d| domain::ClusterServiceConnectDefaults {
                namespace: os(d.namespace()),
            }),
        configuration: None,
        stats: domain::ClusterStats {
            active_services,
            running_tasks: running,
            pending_tasks: pending,
            container_instances: instances,
        },
    }
}

fn container_insights(settings: &[ecs::ClusterSetting]) -> String {
    settings
        .iter()
        .find(|s| s.name() == Some(&ecs::ClusterSettingName::ContainerInsights))
        .and_then(|s| s.value())
        .unwrap_or("disabled")
        .to_string()
}

pub fn capacity_provider(c: &ecs::CapacityProvider) -> domain::CapacityProvider {
    let asg = c.auto_scaling_group_provider();
    let kind = if asg.is_some() {
        "ASG"
    } else {
        c.name().unwrap_or_default()
    }
    .to_string();
    domain::CapacityProvider {
        arn: ss(c.capacity_provider_arn()),
        name: ss(c.name()),
        kind,
        status: c.status().map(|s| s.as_str().to_string()).unwrap_or_default(),
        auto_scaling_group_provider: asg.map(|a| domain::AutoScalingGroupProvider {
            auto_scaling_group_arn: a.auto_scaling_group_arn().to_string(),
            managed_scaling: a.managed_scaling().map(managed_scaling),
            managed_termination_protection: a
                .managed_termination_protection()
                .map(|m| m.as_str().to_string()),
            managed_draining: a.managed_draining().map(|m| m.as_str().to_string()),
        }),
        update_status: c.update_status().map(|s| s.as_str().to_string()),
        update_status_reason: os(c.update_status_reason()),
        tags: c.tags().iter().map(tag).collect(),
    }
}

fn managed_scaling(m: &ecs::ManagedScaling) -> domain::ManagedScaling {
    domain::ManagedScaling {
        status: m.status().map(|s| s.as_str().to_string()),
        target_capacity: m.target_capacity().map(nn),
        minimum_scaling_step_size: m.minimum_scaling_step_size().map(nn),
        maximum_scaling_step_size: m.maximum_scaling_step_size().map(nn),
        instance_warmup_period: m.instance_warmup_period().map(nn),
    }
}

pub fn service(s: &ecs::Service) -> domain::Service {
    domain::Service {
        arn: ss(s.service_arn()),
        name: ss(s.service_name()),
        cluster: cluster_name_from_arn(s.cluster_arn()),
        status: ss(s.status()),
        desired: nn(s.desired_count()),
        running: nn(s.running_count()),
        pending: nn(s.pending_count()),
        launch_type: s.launch_type().map(|l| l.as_str().to_string()),
        capacity_provider_strategy: s.capacity_provider_strategy().iter().map(cps_item).collect(),
        platform_version: os(s.platform_version()),
        platform_family: os(s.platform_family()),
        task_def_arn: ss(s.task_definition()),
        scheduling_strategy: s.scheduling_strategy().map(|x| x.as_str().to_string()),
        deployment_controller: s.deployment_controller().map(|d| domain::DeploymentController {
            kind: d.r#type().as_str().to_string(),
        }),
        deployment_configuration: s.deployment_configuration().map(deployment_configuration),
        deployments: s.deployments().iter().map(deployment).collect(),
        role_arn: os(s.role_arn()),
        created_at: dt(s.created_at()),
        created_by: os(s.created_by()),
        placement_constraints: s.placement_constraints().iter().map(placement_constraint).collect(),
        placement_strategy: s.placement_strategy().iter().map(placement_strategy).collect(),
        network_configuration: s.network_configuration().map(network_configuration),
        health_check_grace_period_seconds: s.health_check_grace_period_seconds(),
        enable_ecs_managed_tags: s.enable_ecs_managed_tags(),
        propagate_tags: s.propagate_tags().map(|p| p.as_str().to_string()),
        enable_execute_command: s.enable_execute_command(),
        availability_zone_rebalancing: s
            .availability_zone_rebalancing()
            .map(|a| a.as_str().to_string()),
        load_balancers: s.load_balancers().iter().map(load_balancer).collect(),
        registries: s.service_registries().iter().map(service_registry).collect(),
        events: s.events().iter().map(service_event).collect(),
        tags: s.tags().iter().map(tag).collect(),
    }
}

fn deployment_configuration(d: &ecs::DeploymentConfiguration) -> domain::DeploymentConfiguration {
    domain::DeploymentConfiguration {
        maximum_percent: d.maximum_percent(),
        minimum_healthy_percent: d.minimum_healthy_percent(),
        deployment_circuit_breaker: d.deployment_circuit_breaker().map(|c| {
            domain::DeploymentCircuitBreaker {
                enable: c.enable(),
                rollback: c.rollback(),
            }
        }),
        alarms: d.alarms().map(|a| domain::DeploymentAlarms {
            alarm_names: a.alarm_names().to_vec(),
            enable: a.enable(),
            rollback: a.rollback(),
        }),
    }
}

fn deployment(d: &ecs::Deployment) -> domain::Deployment {
    domain::Deployment {
        id: ss(d.id()),
        status: ss(d.status()),
        task_def: ss(d.task_definition()),
        desired: nn(d.desired_count()),
        pending: nn(d.pending_count()),
        running: nn(d.running_count()),
        failed_tasks: nn(d.failed_tasks()),
        created_at: dt(d.created_at()),
        updated_at: dt(d.updated_at()),
        launch_type: d.launch_type().map(|l| l.as_str().to_string()),
        platform_version: os(d.platform_version()),
        platform_family: os(d.platform_family()),
        capacity_provider_strategy: d.capacity_provider_strategy().iter().map(cps_item).collect(),
        network_configuration: d.network_configuration().map(network_configuration),
        rollout_state: d.rollout_state().map(|r| r.as_str().to_string()).unwrap_or_default(),
        rollout_state_reason: os(d.rollout_state_reason()),
    }
}

fn service_event(e: &ecs::ServiceEvent) -> domain::ServiceEvent {
    domain::ServiceEvent {
        id: ss(e.id()),
        created_at: dt(e.created_at()).unwrap_or_default(),
        message: ss(e.message()),
    }
}

fn load_balancer(l: &ecs::LoadBalancer) -> domain::LoadBalancerRef {
    domain::LoadBalancerRef {
        target_group_arn: os(l.target_group_arn()),
        load_balancer_name: os(l.load_balancer_name()),
        container_name: ss(l.container_name()),
        container_port: l.container_port().map(nn).unwrap_or_default(),
    }
}

fn service_registry(r: &ecs::ServiceRegistry) -> domain::ServiceRegistryRef {
    domain::ServiceRegistryRef {
        registry_arn: ss(r.registry_arn()),
        container_name: os(r.container_name()),
        container_port: r.container_port().map(nn),
        port: r.port().map(nn),
    }
}

pub fn task(t: &ecs::Task) -> domain::Task {
    let group = ss(t.group());
    let service = group.strip_prefix("service:").map(|s| s.to_string());
    let attachments: Vec<domain::Attachment> = t.attachments().iter().map(attachment).collect();
    domain::Task {
        arn: ss(t.task_arn()),
        task_def_arn: ss(t.task_definition_arn()),
        cluster: cluster_name_from_arn(t.cluster_arn()),
        service,
        last_status: ss(t.last_status()),
        desired_status: ss(t.desired_status()),
        health: t.health_status().map(|h| h.as_str().to_string()).unwrap_or_default(),
        connectivity: t.connectivity().map(|c| c.as_str().to_string()),
        connectivity_at: dt(t.connectivity_at()),
        cpu: os(t.cpu()),
        memory: os(t.memory()),
        availability_zone: os(t.availability_zone()),
        capacity_provider_name: os(t.capacity_provider_name()),
        launch_type: t.launch_type().map(|l| l.as_str().to_string()),
        platform_version: os(t.platform_version()),
        platform_family: os(t.platform_family()),
        container_instance_arn: os(t.container_instance_arn()),
        started_by: os(t.started_by()),
        version: t.version() as i32,
        enable_execute_command: t.enable_execute_command(),
        created_at: dt(t.created_at()),
        started_at: dt(t.started_at()),
        pull_started_at: dt(t.pull_started_at()),
        pull_stopped_at: dt(t.pull_stopped_at()),
        execution_stopped_at: dt(t.execution_stopped_at()),
        stopping_at: dt(t.stopping_at()),
        stopped_at: dt(t.stopped_at()),
        stop_code: t.stop_code().map(|c| c.as_str().to_string()),
        stopped_reason: os(t.stopped_reason()),
        overrides: t.overrides().map(|o| domain::TaskOverride {
            cpu: os(o.cpu()),
            memory: os(o.memory()),
            task_role_arn: os(o.task_role_arn()),
            execution_role_arn: os(o.execution_role_arn()),
        }),
        ephemeral_storage: t.ephemeral_storage().map(|e| domain::EphemeralStorage {
            size_in_gib: e.size_in_gib(),
        }),
        group,
        networking: networking_from_attachments(&attachments),
        attachments,
        attributes: t.attributes().iter().map(attribute).collect(),
        tags: t.tags().iter().map(tag).collect(),
        containers: t.containers().iter().map(container).collect(),
    }
}

fn networking_from_attachments(atts: &[domain::Attachment]) -> Option<domain::Networking> {
    let eni = atts
        .iter()
        .find(|a| a.kind.as_deref() == Some("ElasticNetworkInterface"))?;
    let mut net = domain::Networking::default();
    for kv in &eni.details {
        match kv.name.as_deref() {
            Some("networkInterfaceId") => net.eni_id = kv.value.clone(),
            Some("privateIPv4Address") => net.private_ip = kv.value.clone(),
            Some("subnetId") => net.subnet = kv.value.clone(),
            _ => {}
        }
    }
    Some(net)
}

fn container(c: &ecs::Container) -> domain::Container {
    domain::Container {
        container_arn: os(c.container_arn()),
        name: ss(c.name()),
        image: ss(c.image()),
        image_digest: os(c.image_digest()),
        runtime_id: os(c.runtime_id()),
        last_status: ss(c.last_status()),
        health: c.health_status().map(|h| h.as_str().to_string()).unwrap_or_default(),
        exit_code: c.exit_code(),
        reason: os(c.reason()),
        cpu: os(c.cpu()),
        memory: os(c.memory()),
        memory_reservation: os(c.memory_reservation()),
        gpu_ids: c.gpu_ids().to_vec(),
        network_bindings: c.network_bindings().iter().map(network_binding).collect(),
        network_interfaces: c
            .network_interfaces()
            .iter()
            .map(|n| domain::ContainerNetworkInterface {
                attachment_id: os(n.attachment_id()),
                private_ipv4_address: os(n.private_ipv4_address()),
                ipv6_address: os(n.ipv6_address()),
            })
            .collect(),
        managed_agents: c
            .managed_agents()
            .iter()
            .map(|a| domain::ManagedAgent {
                name: a.name().map(|n| n.as_str().to_string()),
                last_status: os(a.last_status()),
                reason: os(a.reason()),
                last_started_at: dt(a.last_started_at()),
            })
            .collect(),
        log_group: None,
        log_stream: None,
    }
}

fn network_binding(b: &ecs::NetworkBinding) -> domain::NetworkBinding {
    domain::NetworkBinding {
        bind_ip: os(b.bind_ip()),
        container_port: b.container_port().map(nn),
        host_port: b.host_port().map(nn),
        protocol: b.protocol().map(|p| p.as_str().to_string()),
        container_port_range: os(b.container_port_range()),
        host_port_range: os(b.host_port_range()),
    }
}

fn cluster_name_from_arn(arn: Option<&str>) -> String {
    arn.and_then(|a| a.rsplit('/').next())
        .unwrap_or_default()
        .to_string()
}

fn port_mapping(p: &ecs::PortMapping) -> domain::PortMapping {
    domain::PortMapping {
        container_port: p.container_port().map(nn),
        host_port: p.host_port().map(nn),
        protocol: p.protocol().map(|x| x.as_str().to_string()),
        name: os(p.name()),
        app_protocol: p.app_protocol().map(|x| x.as_str().to_string()),
        container_port_range: os(p.container_port_range()),
    }
}

fn log_config(l: &ecs::LogConfiguration) -> domain::LogConfig {
    let options: HashMap<String, String> = l.options().cloned().unwrap_or_default();
    let log_group = options.get("awslogs-group").cloned();
    domain::LogConfig {
        log_driver: l.log_driver().as_str().to_string(),
        log_group,
        options,
        secret_options: l
            .secret_options()
            .iter()
            .map(|s| domain::SecretRef {
                key: s.name().to_string(),
                source_arn: s.value_from().to_string(),
            })
            .collect(),
    }
}

fn container_def(c: &ecs::ContainerDefinition) -> domain::ContainerDef {
    domain::ContainerDef {
        name: ss(c.name()),
        image: ss(c.image()),
        cpu: nn(c.cpu()),
        memory: c.memory().map(nn),
        memory_reservation: c.memory_reservation().map(nn),
        essential: c.essential().unwrap_or(false),
        links: c.links().to_vec(),
        entry_point: c.entry_point().to_vec(),
        command: c.command().to_vec(),
        env: c
            .environment()
            .iter()
            .map(|kv| domain::EnvVar {
                key: ss(kv.name()),
                value: ss(kv.value()),
            })
            .collect(),
        secrets: c
            .secrets()
            .iter()
            .map(|s| domain::SecretRef {
                key: s.name().to_string(),
                source_arn: s.value_from().to_string(),
            })
            .collect(),
        port_mappings: c.port_mappings().iter().map(port_mapping).collect(),
        mount_points: c
            .mount_points()
            .iter()
            .map(|m| domain::MountPoint {
                source_volume: os(m.source_volume()),
                container_path: os(m.container_path()),
                read_only: m.read_only(),
            })
            .collect(),
        working_directory: os(c.working_directory()),
        user: os(c.user()),
        hostname: os(c.hostname()),
        privileged: c.privileged(),
        readonly_root_filesystem: c.readonly_root_filesystem(),
        dns_servers: c.dns_servers().to_vec(),
        docker_security_options: c.docker_security_options().to_vec(),
        docker_labels: c.docker_labels().cloned().unwrap_or_default(),
        credential_specs: c.credential_specs().to_vec(),
        log_config: c.log_configuration().map(log_config),
        ..Default::default()
    }
}

pub fn task_definition(t: &ecs::TaskDefinition) -> domain::TaskDefinition {
    domain::TaskDefinition {
        arn: ss(t.task_definition_arn()),
        family: ss(t.family()),
        revision: nn(t.revision()),
        status: t.status().map(|s| s.as_str().to_string()).unwrap_or_default(),
        task_role_arn: os(t.task_role_arn()),
        execution_role_arn: os(t.execution_role_arn()),
        network_mode: t.network_mode().map(|m| m.as_str().to_string()),
        cpu: os(t.cpu()),
        memory: os(t.memory()),
        pid_mode: t.pid_mode().map(|m| m.as_str().to_string()),
        ipc_mode: t.ipc_mode().map(|m| m.as_str().to_string()),
        requires_compatibilities: t
            .requires_compatibilities()
            .iter()
            .map(|c| c.as_str().to_string())
            .collect(),
        compatibilities: t.compatibilities().iter().map(|c| c.as_str().to_string()).collect(),
        volumes: t
            .volumes()
            .iter()
            .map(|v| domain::Volume {
                name: ss(v.name()),
                host_path: v.host().and_then(|h| os(h.source_path())),
                configured_at_launch: v.configured_at_launch(),
                ..Default::default()
            })
            .collect(),
        container_defs: t.container_definitions().iter().map(container_def).collect(),
        ..Default::default()
    }
}

fn resource(r: &ecs::Resource) -> domain::Resource {
    domain::Resource {
        name: os(r.name()),
        kind: os(r.r#type()),
        double_value: Some(r.double_value()),
        long_value: Some(r.long_value() as i32),
        integer_value: Some(r.integer_value()),
        string_set_value: r.string_set_value().to_vec(),
    }
}

pub fn container_instance(c: &ecs::ContainerInstance, cluster: &str) -> domain::ContainerInstance {
    domain::ContainerInstance {
        arn: ss(c.container_instance_arn()),
        cluster: cluster.to_string(),
        ec2_instance_id: os(c.ec2_instance_id()),
        capacity_provider_name: os(c.capacity_provider_name()),
        status: ss(c.status()),
        status_reason: os(c.status_reason()),
        agent_connected: c.agent_connected(),
        agent_update_status: c.agent_update_status().map(|s| s.as_str().to_string()),
        running_tasks_count: nn(c.running_tasks_count()),
        pending_tasks_count: nn(c.pending_tasks_count()),
        version: c.version() as i32,
        registered_at: dt(c.registered_at()),
        registered_resources: c.registered_resources().iter().map(resource).collect(),
        remaining_resources: c.remaining_resources().iter().map(resource).collect(),
        attributes: c.attributes().iter().map(attribute).collect(),
        attachments: c.attachments().iter().map(attachment).collect(),
        tags: c.tags().iter().map(tag).collect(),
        ..Default::default()
    }
}
