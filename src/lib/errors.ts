import type { AppError, ProfileKind } from "@/types";

export function appErrorMessage(e: AppError, profileKind?: ProfileKind): string {
  switch (e.kind) {
    case "throttled":
      return "AWS throttling — backing off";
    case "authExpired":
      return profileKind === "sso"
        ? `SSO session expired — run: aws sso login --profile ${e.profile}`
        : `credentials for ${e.profile} are invalid or expired — refresh them`;
    case "forbidden":
      return "access denied — check IAM permissions";
    case "notFound":
      return `not found: ${e.resource}`;
    case "aws":
      return `${e.code}: ${e.message}`;
    case "internal":
      return e.message;
    default:
      return "unknown error";
  }
}
