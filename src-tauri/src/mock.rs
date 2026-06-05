use std::collections::HashMap;

use crate::domain::*;
use crate::resources::cloudwatch::MetricQuery;

const T_NOW: &str = "2026-06-02T15:42:00Z";
const T_DEPLOY: &str = "2026-06-02T15:40:30Z";
const T_OLD: &str = "2026-06-02T09:12:00Z";

pub fn profiles() -> Vec<AwsProfile> {
    vec![
        AwsProfile {
            name: "prod".into(),
            kind: ProfileKind::Sso,
            region_default: Some("us-east-1".into()),
            account_id: Some("111111111111".into()),
            status: ProfileStatus::Active,
        },
        AwsProfile {
            name: "staging".into(),
            kind: ProfileKind::AssumeRole,
            region_default: Some("us-west-2".into()),
            account_id: Some("222222222222".into()),
            status: ProfileStatus::Active,
        },
        AwsProfile {
            name: "dev".into(),
            kind: ProfileKind::Static,
            region_default: Some("eu-west-1".into()),
            account_id: Some("333333333333".into()),
            status: ProfileStatus::Active,
        },
        AwsProfile {
            name: "sandbox".into(),
            kind: ProfileKind::Sso,
            region_default: Some("us-east-2".into()),
            account_id: None,
            status: ProfileStatus::NeedsReauth,
        },
    ]
}

pub fn discover(scope: &Scope) -> ResourceGraph {
    let account = account_for(&scope.profile);
    let region = scope.region.as_str();

    let mut clusters = Vec::new();
    let mut services = Vec::new();
    let mut tasks = Vec::new();
    let mut task_definitions = Vec::new();

    for cspec in cluster_specs() {
        let mut active_services = 0u32;
        let mut running_tasks = 0u32;
        let mut pending_tasks = 0u32;

        for svc in &cspec.services {
            active_services += 1;
            let family = format!("{}-{}", cspec.name, svc.name);
            let revision = 8 + (svc.name.len() as u32);
            let tdarn = arn_taskdef(region, &account, &family, revision);
            task_definitions.push(make_task_def(region, &account, &family, revision, svc));

            let running = if svc.deploying { svc.desired.saturating_sub(1) } else { svc.desired };
            let pending = if svc.deploying { 2 } else { 0 };
            running_tasks += running;
            pending_tasks += pending;

            services.push(Service {
                arn: arn_service(region, &account, cspec.name, svc.name),
                name: svc.name.into(),
                cluster: cspec.name.into(),
                status: if svc.draining { "DRAINING".into() } else { "ACTIVE".into() },
                desired: svc.desired,
                running,
                pending,
                launch_type: Some("FARGATE".into()),
                platform_version: Some("LATEST".into()),
                task_def_arn: tdarn.clone(),
                scheduling_strategy: Some("REPLICA".into()),
                deployment_controller: Some(DeploymentController { kind: "ECS".into() }),
                deployments: deployments_for(svc, region, &account, &family, revision, &tdarn),
                role_arn: None,
                created_at: Some(T_OLD.into()),
                placement_strategy: vec![PlacementStrategy {
                    kind: Some("spread".into()),
                    field: Some("attribute:ecs.availability-zone".into()),
                }],
                network_configuration: Some(NetworkConfiguration {
                    awsvpc_configuration: Some(AwsVpcConfiguration {
                        subnets: vec!["subnet-0a1b2c3d4e5f6a7b8".into()],
                        security_groups: vec!["sg-0e5d4c3b2a1908172".into()],
                        assign_public_ip: Some("DISABLED".into()),
                    }),
                }),
                enable_ecs_managed_tags: true,
                enable_execute_command: svc.name == "api",
                load_balancers: load_balancers_for(svc, region, &account),
                events: events_for(svc),
                tags: vec![Tag { key: Some("team".into()), value: Some("platform".into()) }],
                ..Default::default()
            });

            for i in 0..running {
                tasks.push(make_task(region, &account, cspec.name, svc, &tdarn, i, "RUNNING"));
            }
            for i in 0..pending {
                tasks.push(make_task(region, &account, cspec.name, svc, &tdarn, 90 + i, "PENDING"));
            }
            if svc.name == "worker" {
                let mut stopped = make_task(region, &account, cspec.name, svc, &tdarn, 200, "STOPPED");
                stopped.health = "UNHEALTHY".into();
                stopped.desired_status = "STOPPED".into();
                stopped.stop_code = Some("EssentialContainerExited".into());
                stopped.stopped_reason =
                    Some("Essential container in task exited (OutOfMemory)".into());
                stopped.stopped_at = Some(T_NOW.into());
                if let Some(c) = stopped.containers.first_mut() {
                    c.last_status = "STOPPED".into();
                    c.exit_code = Some(137);
                    c.reason = Some("OutOfMemoryError: container killed due to memory usage".into());
                    c.health = "UNHEALTHY".into();
                }
                tasks.push(stopped);
            }
        }

        clusters.push(Cluster {
            arn: arn_cluster(region, &account, cspec.name),
            name: cspec.name.into(),
            status: "ACTIVE".into(),
            registered_container_instances_count: 0,
            running_tasks_count: running_tasks,
            pending_tasks_count: pending_tasks,
            active_services_count: active_services,
            statistics: Vec::new(),
            tags: vec![Tag { key: Some("env".into()), value: Some(scope.profile.clone()) }],
            settings: ClusterSettings {
                container_insights: if cspec.insights { "enabled".into() } else { "disabled".into() },
            },
            capacity_providers: vec!["FARGATE".into(), "FARGATE_SPOT".into()],
            default_strategy: vec![
                CapacityProviderStrategyItem { capacity_provider: "FARGATE".into(), weight: 1, base: 1 },
                CapacityProviderStrategyItem { capacity_provider: "FARGATE_SPOT".into(), weight: 4, base: 0 },
            ],
            stats: ClusterStats {
                active_services,
                running_tasks,
                pending_tasks,
                container_instances: 0,
            },
            ..Default::default()
        });
    }

    ResourceGraph {
        scope: scope.clone(),
        account_id: Some(account),
        fetched_at: T_NOW.into(),
        clusters,
        capacity_providers: capacity_providers(),
        services,
        tasks,
        container_instances: Vec::new(),
        task_definitions,
    }
}

struct SvcSpec {
    name: &'static str,
    desired: u32,
    image: &'static str,
    port: u32,
    deploying: bool,
    draining: bool,
}

struct ClusterSpec {
    name: &'static str,
    insights: bool,
    services: Vec<SvcSpec>,
}

fn cluster_specs() -> Vec<ClusterSpec> {
    vec![
        ClusterSpec {
            name: "frontend",
            insights: true,
            services: vec![
                SvcSpec { name: "web", desired: 4, image: "web:1.42.0", port: 8080, deploying: false, draining: false },
                SvcSpec { name: "gateway", desired: 2, image: "gateway:0.9.3", port: 443, deploying: false, draining: false },
            ],
        },
        ClusterSpec {
            name: "backend",
            insights: false,
            services: vec![
                SvcSpec { name: "api", desired: 6, image: "api:2.17.1", port: 8000, deploying: true, draining: false },
                SvcSpec { name: "worker", desired: 3, image: "worker:2.17.1", port: 0, deploying: false, draining: false },
                SvcSpec { name: "scheduler", desired: 1, image: "scheduler:1.4.0", port: 0, deploying: false, draining: true },
            ],
        },
    ]
}

pub fn image_scan(repository: &str, reference: &str) -> ImageScan {
    ImageScan {
        repository: repository.into(),
        reference: reference.into(),
        registry_id: Some("111111111111".into()),
        scan_status: Some("COMPLETE".into()),
        critical: 1,
        high: 3,
        medium: 7,
        low: 12,
        informational: 2,
        undefined: 0,
        scanned_at: Some(T_OLD.into()),
    }
}

pub fn target_health() -> Vec<TargetHealth> {
    (0..4)
        .map(|i| {
            let unhealthy = i == 3;
            TargetHealth {
                target_id: format!("10.0.{}.{}", (i % 4) + 1, 20 + i),
                port: Some(8080),
                availability_zone: Some("us-east-1a".into()),
                state: if unhealthy { "unhealthy".into() } else { "healthy".into() },
                reason: unhealthy.then(|| "Target.ResponseCodeMismatch".into()),
                description: unhealthy
                    .then(|| "Health checks failed with these codes: [503]".into()),
            }
        })
        .collect()
}

pub fn metric_series(query: &MetricQuery, start_secs: i64, end_secs: i64, period: i32) -> MetricSeries {
    let step = period.max(1) as i64;
    let (base, amp) = if query.id.contains("cpu") {
        (42.0, 14.0)
    } else if query.id.contains("mem") {
        (58.0, 9.0)
    } else if query.id.contains("req") {
        (120.0, 40.0)
    } else {
        (30.0, 12.0)
    };
    let mut points = Vec::new();
    let mut t = start_secs;
    let mut i = 0i64;
    while t <= end_secs {
        let phase = i as f64 * 0.35;
        let value = (base + phase.sin() * amp + ((i % 5) as f64) - 2.0).max(0.0);
        points.push(MetricPoint {
            timestamp: iso_secs(t),
            value: (value * 10.0).round() / 10.0,
        });
        t += step;
        i += 1;
    }
    MetricSeries {
        label: query.label.clone(),
        namespace: query.namespace.clone(),
        metric_name: query.metric_name.clone(),
        unit: None,
        points,
    }
}

pub fn eni_detail(eni_id: &str) -> EniDetail {
    EniDetail {
        eni_id: eni_id.to_string(),
        status: Some("in-use".into()),
        interface_type: Some("interface".into()),
        description: Some("arn:aws:ecs:us-east-1:111111111111:attachment/abc".into()),
        private_ip: Some("10.0.1.42".into()),
        public_ip: None,
        subnet_id: Some("subnet-0a1b2c3d4e5f6a7b8".into()),
        vpc_id: Some("vpc-0f1e2d3c4b5a69788".into()),
        availability_zone: Some("us-east-1a".into()),
        security_groups: vec![
            SecurityGroupRef { id: "sg-0e5d4c3b2a1908172".into(), name: Some("ecs-tasks".into()) },
            SecurityGroupRef {
                id: "sg-0a1b2c3d4e5f60718".into(),
                name: Some("allow-from-alb".into()),
            },
        ],
    }
}

pub fn network_options() -> NetworkOptions {
    let vpc = "vpc-0f1e2d3c4b5a69788";
    NetworkOptions {
        vpcs: vec![Vpc {
            id: vpc.into(),
            cidr: Some("10.0.0.0/16".into()),
            is_default: true,
            name: Some("default".into()),
        }],
        subnets: vec![
            Subnet {
                id: "subnet-0a1b2c3d4e5f6a7b8".into(),
                vpc_id: vpc.into(),
                availability_zone: Some("us-east-1a".into()),
                cidr: Some("10.0.1.0/24".into()),
                name: Some("public-1a".into()),
            },
            Subnet {
                id: "subnet-1b2c3d4e5f6a7b8c9".into(),
                vpc_id: vpc.into(),
                availability_zone: Some("us-east-1b".into()),
                cidr: Some("10.0.2.0/24".into()),
                name: Some("public-1b".into()),
            },
        ],
        security_groups: vec![
            SecurityGroup {
                id: "sg-0e5d4c3b2a1908172".into(),
                vpc_id: vpc.into(),
                name: Some("default".into()),
                description: Some("default VPC security group".into()),
            },
            SecurityGroup {
                id: "sg-0a1b2c3d4e5f60718".into(),
                vpc_id: vpc.into(),
                name: Some("ecs-tasks".into()),
                description: Some("ECS tasks".into()),
            },
        ],
    }
}

pub fn log_lines(stream: &str, token: Option<String>) -> (Vec<LogEvent>, Option<String>) {
    const MSGS: [&str; 6] = [
        "GET /healthz 200 1ms",
        "processed job batch=42 ok",
        "WARN slow query took 412ms",
        "GET /api/v1/items 200 8ms",
        "flushed 128 metrics",
        "POST /api/v1/orders 201 22ms",
    ];
    let n: u64 = token.as_deref().and_then(|t| t.parse().ok()).unwrap_or(0);
    let lines = (0..3)
        .map(|i| {
            let idx = n + i;
            LogEvent {
                timestamp: iso_secs(1_780_000_000 + idx as i64 * 2),
                message: format!("[{idx}] {}", MSGS[idx as usize % MSGS.len()]),
                ingestion_time: None,
                stream: Some(stream.to_string()),
            }
        })
        .collect();
    (lines, Some((n + 3).to_string()))
}

fn iso_secs(secs: i64) -> String {
    aws_smithy_types::DateTime::from_secs(secs)
        .fmt(aws_smithy_types::date_time::Format::DateTime)
        .unwrap_or_default()
}

pub fn scaling_view() -> ScalingView {
    ScalingView {
        targets: vec![ScalingTarget {
            resource_id: "service/frontend/web".into(),
            service_namespace: "ecs".into(),
            scalable_dimension: "ecs:service:DesiredCount".into(),
            min_capacity: 2,
            max_capacity: 12,
            role_arn: Some(
                "arn:aws:iam::111111111111:role/aws-service-role/ecs.application-autoscaling".into(),
            ),
        }],
        policies: vec![
            ScalingPolicy {
                name: "cpu-target-tracking".into(),
                policy_arn: "arn:aws:autoscaling:us-east-1:111111111111:scalingPolicy:abc:resource/ecs/service/frontend/web:policyName/cpu".into(),
                kind: "TargetTrackingScaling".into(),
                resource_id: "service/frontend/web".into(),
                scalable_dimension: "ecs:service:DesiredCount".into(),
                predefined_metric: Some("ECSServiceAverageCPUUtilization".into()),
                target_value: Some(60.0),
                scale_in_cooldown: Some(300),
                scale_out_cooldown: Some(60),
            },
        ],
    }
}

fn capacity_providers() -> Vec<CapacityProvider> {
    vec![
        CapacityProvider { name: "FARGATE".into(), arn: String::new(), kind: "FARGATE".into(), status: "ACTIVE".into(), ..Default::default() },
        CapacityProvider { name: "FARGATE_SPOT".into(), arn: String::new(), kind: "FARGATE_SPOT".into(), status: "ACTIVE".into(), ..Default::default() },
    ]
}

fn account_for(profile: &str) -> String {
    match profile {
        "prod" => "111111111111",
        "staging" => "222222222222",
        "dev" => "333333333333",
        _ => "999999999999",
    }
    .to_string()
}

fn make_task_def(region: &str, account: &str, family: &str, revision: u32, svc: &SvcSpec) -> TaskDefinition {
    let mut options = HashMap::new();
    options.insert("awslogs-group".into(), format!("/ecs/{family}"));
    options.insert("awslogs-region".into(), region.to_string());
    options.insert("awslogs-stream-prefix".into(), "ecs".into());

    let mut port_mappings = Vec::new();
    if svc.port != 0 {
        port_mappings.push(PortMapping {
            container_port: Some(svc.port),
            host_port: Some(svc.port),
            protocol: Some("tcp".into()),
            ..Default::default()
        });
    }

    let container = ContainerDef {
        name: svc.name.into(),
        image: format!("{account}.dkr.ecr.{region}.amazonaws.com/{}", svc.image),
        cpu: 256,
        memory: Some(512),
        essential: true,
        env: vec![
            EnvVar { key: "LOG_LEVEL".into(), value: "info".into() },
            EnvVar { key: "PORT".into(), value: svc.port.to_string() },
        ],
        secrets: vec![SecretRef {
            key: "DB_PASSWORD".into(),
            source_arn: format!("arn:aws:secretsmanager:{region}:{account}:secret:{}/db-AbCdEf", svc.name),
        }],
        port_mappings,
        log_config: Some(LogConfig {
            log_driver: "awslogs".into(),
            log_group: Some(format!("/ecs/{family}")),
            options,
            ..Default::default()
        }),
        ..Default::default()
    };

    TaskDefinition {
        arn: arn_taskdef(region, account, family, revision),
        family: family.into(),
        revision,
        status: "ACTIVE".into(),
        cpu: Some("512".into()),
        memory: Some("1024".into()),
        network_mode: Some("awsvpc".into()),
        requires_compatibilities: vec!["FARGATE".into()],
        container_defs: vec![container],
        ..Default::default()
    }
}

fn deployments_for(
    svc: &SvcSpec,
    region: &str,
    account: &str,
    family: &str,
    revision: u32,
    tdarn: &str,
) -> Vec<Deployment> {
    let mut out = vec![Deployment {
        id: format!("ecs-svc/{}", fnv(&format!("{}-primary", svc.name))),
        status: "PRIMARY".into(),
        task_def: tdarn.into(),
        desired: svc.desired,
        running: if svc.deploying { svc.desired.saturating_sub(1) } else { svc.desired },
        pending: if svc.deploying { 2 } else { 0 },
        created_at: Some(if svc.deploying { T_DEPLOY } else { T_OLD }.into()),
        updated_at: Some(T_NOW.into()),
        launch_type: Some("FARGATE".into()),
        rollout_state: if svc.deploying { "IN_PROGRESS".into() } else { "COMPLETED".into() },
        ..Default::default()
    }];
    if svc.deploying {
        out.push(Deployment {
            id: format!("ecs-svc/{}", fnv(&format!("{}-active", svc.name))),
            status: "ACTIVE".into(),
            task_def: arn_taskdef(region, account, family, revision.saturating_sub(1)),
            desired: svc.desired,
            running: 1,
            created_at: Some(T_OLD.into()),
            launch_type: Some("FARGATE".into()),
            rollout_state: "COMPLETED".into(),
            ..Default::default()
        });
    }
    out
}

fn events_for(svc: &SvcSpec) -> Vec<ServiceEvent> {
    if svc.deploying {
        vec![ServiceEvent {
            id: format!("{}", fnv(&format!("{}-evt-deploy", svc.name))),
            created_at: T_DEPLOY.into(),
            message: format!("(service {}) has started 2 tasks: (deployment new).", svc.name),
        }]
    } else {
        vec![ServiceEvent {
            id: format!("{}", fnv(&format!("{}-evt-steady", svc.name))),
            created_at: T_NOW.into(),
            message: format!("(service {}) has reached a steady state.", svc.name),
        }]
    }
}

fn load_balancers_for(svc: &SvcSpec, region: &str, account: &str) -> Vec<LoadBalancerRef> {
    if svc.port == 443 || svc.port == 8080 {
        vec![LoadBalancerRef {
            target_group_arn: Some(arn_target_group(region, account, svc.name)),
            container_name: svc.name.into(),
            container_port: svc.port,
            ..Default::default()
        }]
    } else {
        Vec::new()
    }
}

fn make_task(
    region: &str,
    account: &str,
    cluster: &str,
    svc: &SvcSpec,
    tdarn: &str,
    seq: u32,
    status: &str,
) -> Task {
    let id = task_id(cluster, svc.name, seq);
    let mut bindings = Vec::new();
    if svc.port != 0 {
        bindings.push(NetworkBinding {
            container_port: Some(svc.port),
            host_port: Some(svc.port),
            protocol: Some("tcp".into()),
            ..Default::default()
        });
    }
    let health = if status == "RUNNING" { "HEALTHY" } else { "UNKNOWN" };
    let container = Container {
        name: svc.name.into(),
        image: format!("{account}.dkr.ecr.{region}.amazonaws.com/{}", svc.image),
        last_status: status.into(),
        health: health.into(),
        network_bindings: bindings,
        log_group: Some(format!("/ecs/{cluster}-{}", svc.name)),
        log_stream: Some(format!("ecs/{}/{}", svc.name, id)),
        ..Default::default()
    };
    Task {
        arn: arn_task(region, account, cluster, &id),
        task_def_arn: tdarn.into(),
        cluster: cluster.into(),
        group: format!("service:{}", svc.name),
        service: Some(svc.name.into()),
        last_status: status.into(),
        desired_status: "RUNNING".into(),
        health: health.into(),
        cpu: Some("512".into()),
        memory: Some("1024".into()),
        availability_zone: Some(format!("{region}a")),
        launch_type: Some("FARGATE".into()),
        platform_version: Some("1.4.0".into()),
        connectivity: Some("CONNECTED".into()),
        version: 3,
        started_at: if status == "PENDING" { None } else { Some(T_OLD.into()) },
        containers: vec![container],
        networking: Some(Networking {
            eni_id: Some(format!("eni-{}", &id[..17])),
            private_ip: Some(format!("10.0.{}.{}", (seq % 4) + 1, 20 + (seq % 200))),
            public_ip: None,
            subnet: Some("subnet-0a1b2c3d4e5f6a7b8".into()),
            vpc: Some("vpc-0f1e2d3c4b5a69788".into()),
            security_groups: vec!["sg-0e5d4c3b2a1908172".into()],
        }),
        ..Default::default()
    }
}

fn arn_cluster(region: &str, account: &str, name: &str) -> String {
    format!("arn:aws:ecs:{region}:{account}:cluster/{name}")
}

fn arn_service(region: &str, account: &str, cluster: &str, name: &str) -> String {
    format!("arn:aws:ecs:{region}:{account}:service/{cluster}/{name}")
}

fn arn_task(region: &str, account: &str, cluster: &str, id: &str) -> String {
    format!("arn:aws:ecs:{region}:{account}:task/{cluster}/{id}")
}

fn arn_taskdef(region: &str, account: &str, family: &str, revision: u32) -> String {
    format!("arn:aws:ecs:{region}:{account}:task-definition/{family}:{revision}")
}

fn arn_target_group(region: &str, account: &str, name: &str) -> String {
    format!(
        "arn:aws:elasticloadbalancing:{region}:{account}:targetgroup/{name}/{:016x}",
        fnv(name)
    )
}

fn task_id(cluster: &str, service: &str, seq: u32) -> String {
    let seed = format!("{cluster}/{service}/{seq}");
    let a = fnv(&seed);
    let b = a.wrapping_mul(0x2545_f491_4f6c_dd1d);
    format!("{a:016x}{b:016x}")
}

fn fnv(seed: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in seed.bytes() {
        h ^= byte as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}
