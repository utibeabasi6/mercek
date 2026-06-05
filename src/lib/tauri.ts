import { invoke as tauriInvoke, Channel } from "@tauri-apps/api/core";
import type { ThreadItem, ThreadMeta } from "@/features/agent/thread";
import type {
  AgentInfo,
  AgentIntent,
  AgentSessionUpdate,
  AwsProfile,
  ConnectInfo,
  Cluster,
  ClusterResources,
  EniDetail,
  EnvVar,
  ImageScan,
  LogEvent,
  SecretRef,
  MetricSeries,
  NetworkOptions,
  ResourceGraph,
  ScalingView,
  Scope,
  ScopeDiscovery,
  Service,
  TargetHealth,
  Task,
  TaskDefinition,
} from "@/types";

type CommandMap = {
  agent_list: { args: void; result: AgentInfo[] };
  agent_connect: { args: { agentId: string; model?: string }; result: ConnectInfo };
  agent_set_mode: { args: { modeId: string }; result: void };
  agent_respond_permission: { args: { id: number; optionId: string | null }; result: void };
  agent_prompt: {
    args: {
      text: string;
      context?: string;
      updates: Channel<AgentSessionUpdate>;
      intents: Channel<AgentIntent>;
    };
    result: string;
  };
  agent_cancel: { args: void; result: void };
  agent_disconnect: { args: void; result: void };
  agent_threads_list: { args: void; result: ThreadMeta[] };
  agent_thread_load: { args: { id: string }; result: ThreadItem[] | null };
  agent_thread_save: {
    args: { id: string; title: string; createdAt: number; updatedAt: number; items: ThreadItem[] };
    result: ThreadMeta[];
  };
  agent_thread_delete: { args: { id: string }; result: ThreadMeta[] };
  list_profiles: { args: void; result: AwsProfile[] };
  get_scopes: { args: void; result: Scope[] };
  set_scopes: { args: { scopes: Scope[] }; result: void };
  throttle_active: { args: void; result: boolean };
  discover: { args: { scope: Scope }; result: ResourceGraph };
  discover_activated: { args: void; result: ScopeDiscovery[] };
  snapshot_activated: { args: void; result: ResourceGraph[] };
  cluster_resources: { args: { scope: Scope; cluster: string }; result: ClusterResources };
  task_definition: { args: { scope: Scope; arn: string }; result: TaskDefinition };
  list_task_definitions: { args: { scope: Scope; family: string }; result: string[] };
  list_task_def_families: { args: { scope: Scope }; result: string[] };
  target_health: { args: { scope: Scope; targetGroupArn: string }; result: TargetHealth[] };
  scaling: { args: { scope: Scope; cluster: string; service: string }; result: ScalingView };
  scale_service: {
    args: { scope: Scope; cluster: string; service: string; desiredCount: number };
    result: Service;
  };
  update_service: {
    args: {
      scope: Scope;
      cluster: string;
      service: string;
      taskDefinition?: string;
      minimumHealthyPercent?: number;
      maximumPercent?: number;
    };
    result: Service;
  };
  force_deploy: { args: { scope: Scope; cluster: string; service: string }; result: Service };
  enable_exec: { args: { scope: Scope; cluster: string; service: string }; result: Service };
  deploy_image: {
    args: {
      scope: Scope;
      cluster: string;
      service: string;
      baseArn: string;
      containerName: string;
      image: string;
    };
    result: Service;
  };
  create_service: {
    args: {
      scope: Scope;
      cluster: string;
      name: string;
      taskDefinition: string;
      desiredCount: number;
      launchType: string;
      subnets: string[];
      securityGroups: string[];
      assignPublicIp: boolean;
      targetGroupArn?: string;
      containerName?: string;
      containerPort?: number;
    };
    result: Service;
  };
  create_cluster: {
    args: { scope: Scope; name: string; containerInsights: boolean };
    result: Cluster;
  };
  delete_service: {
    args: { scope: Scope; cluster: string; service: string; force: boolean };
    result: Service;
  };
  delete_cluster: { args: { scope: Scope; name: string }; result: void };
  deregister_task_def: { args: { scope: Scope; arn: string }; result: void };
  stop_task: {
    args: { scope: Scope; cluster: string; task: string; reason?: string };
    result: Task;
  };
  run_task: {
    args: {
      scope: Scope;
      cluster: string;
      taskDefinition: string;
      count: number;
      launchType: string;
      subnets: string[];
      securityGroups: string[];
      assignPublicIp: boolean;
      containerName?: string;
      command: string[];
      env: EnvVar[];
    };
    result: Task[];
  };
  register_revision: {
    args: {
      scope: Scope;
      baseArn: string;
      containerName: string;
      image?: string;
      env: EnvVar[];
      secrets: SecretRef[];
      cpu?: string;
      memory?: string;
    };
    result: TaskDefinition;
  };
  register_task_def: {
    args: {
      scope: Scope;
      family: string;
      networkMode: string;
      requiresCompatibilities: string[];
      cpu?: string;
      memory?: string;
      executionRoleArn?: string;
      taskRoleArn?: string;
      containers: {
        name: string;
        image: string;
        cpu?: number;
        memory?: number;
        port?: number;
        command: string[];
        essential: boolean;
        env: EnvVar[];
      }[];
    };
    result: TaskDefinition;
  };
  service_metrics: {
    args: {
      scope: Scope;
      cluster: string;
      service: string;
      containerInsights: boolean;
      rangeSecs: number;
    };
    result: MetricSeries[];
  };
  cluster_metrics: {
    args: { scope: Scope; cluster: string; containerInsights: boolean; rangeSecs: number };
    result: MetricSeries[];
  };
  alb_metrics: {
    args: { scope: Scope; targetGroupArn: string; rangeSecs: number };
    result: MetricSeries[];
  };
  start_log_tail: {
    args: { scope: Scope; logGroup: string; logStream: string; onEvent: Channel<LogEvent> };
    result: number;
  };
  start_log_tail_group: {
    args: { scope: Scope; logGroup: string; filterPattern?: string; onEvent: Channel<LogEvent> };
    result: number;
  };
  stop_log_tail: { args: { tailId: number }; result: void };
  exec_start: {
    args: {
      scope: Scope;
      cluster: string;
      task: string;
      container: string;
      command?: string;
      rows: number;
      cols: number;
      onOutput: Channel<string>;
    };
    result: number;
  };
  exec_write: { args: { session: number; data: string }; result: void };
  exec_resize: { args: { session: number; rows: number; cols: number }; result: void };
  exec_stop: { args: { session: number }; result: void };
  describe_eni: { args: { scope: Scope; eniId: string }; result: EniDetail };
  network_options: { args: { scope: Scope }; result: NetworkOptions };
  image_scan: {
    args: { scope: Scope; repository: string; reference: string };
    result: ImageScan;
  };
};

type Args<K extends keyof CommandMap> = CommandMap[K]["args"];

export async function invoke<K extends keyof CommandMap>(
  command: K,
  ...rest: Args<K> extends void ? [] : [Args<K>]
): Promise<CommandMap[K]["result"]> {
  const [args] = rest;
  return tauriInvoke<CommandMap[K]["result"]>(
    command,
    args as Record<string, unknown> | undefined,
  );
}

export function createChannel<T>(onEvent: (message: T) => void): Channel<T> {
  const channel = new Channel<T>();
  channel.onmessage = onEvent;
  return channel;
}

export { Channel };
