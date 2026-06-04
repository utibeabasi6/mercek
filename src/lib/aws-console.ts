// Deep links into the AWS ECS console (v2). The console host is region- and
// partition-specific; the path segments use the redirect-friendly base forms so they
// keep working as AWS shuffles the sub-tabs. Which AWS account the link lands in is
// decided by the browser's existing console session — we can't (and shouldn't) force it.

function consoleHost(region: string): string {
  if (region.startsWith("us-gov-")) return `https://${region}.console.amazonaws-us-gov.com`;
  if (region.startsWith("cn-")) return `https://${region}.console.amazonaws.cn`;
  return `https://${region}.console.aws.amazon.com`;
}

const seg = (s: string) => encodeURIComponent(s);
const q = (region: string) => `?region=${encodeURIComponent(region)}`;

export const awsConsole = {
  cluster: (region: string, cluster: string) =>
    `${consoleHost(region)}/ecs/v2/clusters/${seg(cluster)}/services${q(region)}`,

  service: (region: string, cluster: string, service: string) =>
    `${consoleHost(region)}/ecs/v2/clusters/${seg(cluster)}/services/${seg(service)}/health${q(region)}`,

  task: (region: string, cluster: string, taskId: string) =>
    `${consoleHost(region)}/ecs/v2/clusters/${seg(cluster)}/tasks/${seg(taskId)}${q(region)}`,
};
