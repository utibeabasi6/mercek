export interface EcrRef {
  registry: string;
  repository: string;
  reference: string; // tag, or `sha256:…` digest
}

// Recognize ECR image refs and split into repo + tag/digest. Returns null for
// non-ECR images (Docker Hub, public registries) — we only scan ECR.
// e.g. 12345.dkr.ecr.us-east-1.amazonaws.com/team/api:1.4.2
export function parseEcrImage(image: string): EcrRef | null {
  const m = /^(\d+\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com)\/(.+)$/.exec(image.trim());
  if (!m) return null;
  const registry = m[1];
  let rest = m[2];
  let reference = "latest";
  const at = rest.indexOf("@");
  if (at >= 0) {
    reference = rest.slice(at + 1);
    rest = rest.slice(0, at);
  } else {
    const colon = rest.lastIndexOf(":");
    if (colon > rest.lastIndexOf("/")) {
      reference = rest.slice(colon + 1);
      rest = rest.slice(0, colon);
    }
  }
  return { registry, repository: rest, reference };
}
