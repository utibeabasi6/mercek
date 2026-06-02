import { invoke as tauriInvoke, Channel } from "@tauri-apps/api/core";
import type {
  AgentInfo,
  AgentIntent,
  AgentSessionUpdate,
  AwsProfile,
  ClusterResources,
  EniDetail,
  EnvVar,
  LogEvent,
  SecretRef,
  MetricSeries,
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
  agent_connect: { args: { agentId: string }; result: void };
  agent_prompt: {
    args: { text: string; updates: Channel<AgentSessionUpdate>; intents: Channel<AgentIntent> };
    result: string;
  };
  agent_cancel: { args: void; result: void };
  agent_disconnect: { args: void; result: void };
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
  service_metrics: {
    args: { scope: Scope; cluster: string; service: string; containerInsights: boolean };
    result: MetricSeries[];
  };
  cluster_metrics: {
    args: { scope: Scope; cluster: string; containerInsights: boolean };
    result: MetricSeries[];
  };
  alb_metrics: { args: { scope: Scope; targetGroupArn: string }; result: MetricSeries[] };
  start_log_tail: {
    args: { scope: Scope; logGroup: string; logStream: string; onEvent: Channel<LogEvent> };
    result: number;
  };
  stop_log_tail: { args: { tailId: number }; result: void };
  describe_eni: { args: { scope: Scope; eniId: string }; result: EniDetail };
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
