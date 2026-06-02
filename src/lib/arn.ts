export interface ParsedArn {
  partition: string;
  service: string;
  region: string;
  accountId: string;
  resourceType: string;
  resourceId: string;
}

export function parseArn(arn: string): ParsedArn | null {
  const parts = arn.split(":");
  if (parts.length < 6 || parts[0] !== "arn") return null;
  const [, partition, service, region, accountId, ...rest] = parts;
  const tail = rest.join(":");
  const sep = tail.includes("/") ? "/" : ":";
  const idx = tail.indexOf(sep);
  const resourceType = idx === -1 ? "" : tail.slice(0, idx);
  const resourceId = idx === -1 ? tail : tail.slice(idx + 1);
  return { partition, service, region, accountId, resourceType, resourceId };
}

export function arnName(arn: string): string {
  const parsed = parseArn(arn);
  if (!parsed) return arn;
  const segments = parsed.resourceId.split("/");
  return segments[segments.length - 1] || parsed.resourceId;
}

export function shortAccount(accountId: string | null | undefined): string {
  if (!accountId) return "—";
  return accountId.length > 6 ? `${accountId.slice(0, 4)}…${accountId.slice(-4)}` : accountId;
}

export function taskDefShort(arn: string): string {
  const name = arnName(arn);
  return name.includes(":") ? name : arn.split("/").pop() ?? arn;
}
