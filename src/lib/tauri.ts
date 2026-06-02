import { invoke as tauriInvoke, Channel } from "@tauri-apps/api/core";
import type {
  AwsProfile,
  ClusterResources,
  EniDetail,
  LogEvent,
  MetricSeries,
  ResourceGraph,
  ScalingView,
  Scope,
  ScopeDiscovery,
  TargetHealth,
  TaskDefinition,
} from "@/types";

type CommandMap = {
  list_profiles: { args: void; result: AwsProfile[] };
  get_scopes: { args: void; result: Scope[] };
  set_scopes: { args: { scopes: Scope[] }; result: void };
  discover: { args: { scope: Scope }; result: ResourceGraph };
  discover_activated: { args: void; result: ScopeDiscovery[] };
  snapshot_activated: { args: void; result: ResourceGraph[] };
  cluster_resources: { args: { scope: Scope; cluster: string }; result: ClusterResources };
  task_definition: { args: { scope: Scope; arn: string }; result: TaskDefinition };
  target_health: { args: { scope: Scope; targetGroupArn: string }; result: TargetHealth[] };
  scaling: { args: { scope: Scope; cluster: string; service: string }; result: ScalingView };
  service_metrics: {
    args: { scope: Scope; cluster: string; service: string };
    result: MetricSeries[];
  };
  cluster_metrics: { args: { scope: Scope; cluster: string }; result: MetricSeries[] };
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
