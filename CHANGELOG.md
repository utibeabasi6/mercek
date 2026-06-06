# Changelog

All notable changes to Mercek are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-05

### Added

- In-app auto-update: Mercek checks for a new release on launch and offers a one-click
  "Update & restart". Update artifacts are signed and verified before installing.
- Linux (.deb / .AppImage) builds are now produced by the release pipeline alongside
  the universal macOS build.
- Delete / teardown from the UI, each behind a confirmation: delete a service (stopping
  its running tasks), delete an empty cluster, and deregister a task-definition revision.
- The run-task and create-service forms now pick the VPC, subnets, and security groups for
  you: it detects the cluster's VPC from a subnet its existing services use (falling back
  to the default VPC), then offers that VPC's subnets and groups as checklists instead of
  typing IDs by hand.
- Tab operations: right-click a tab (or use the command palette) for Close, Close Others,
  Close to the Right, and Close All (⌘⇧W); middle-click a tab to close it.
- The agent model is now picked from a per-provider dropdown (with a "custom…" escape for
  any other id) instead of typed by hand.
- The scope selector can now activate a profile in several regions at once (a per-profile
  region menu), so you can watch one account across multiple regions without duplicate
  `~/.aws` profile entries.

### Security

- Agent markdown no longer loads remote images, and a restrictive Content-Security-Policy
  now backstops the webview — closing a zero-click data-exfiltration vector where a
  prompt-injected agent could beacon out AWS data via a markdown image. (Thanks to Jason
  Cumberland for the disclosure.)
- The connected harness's own file-write / shell permission prompts are now surfaced to
  you to approve or deny, honoring the session mode (Bypass approves automatically; reads
  are auto-approved), instead of being auto-approved — closing a prompt-injection path to
  local file writes / command execution.
- The Claude Code adapter is pinned to a version of `@zed-industries/claude-code-acp`
  rather than fetching the latest on each run.
- The `mercek --mcp` tool subprocess now receives only an allowlist of environment
  variables (HOME / PATH / AWS_* / XDG_* / proxy / TLS) instead of the full environment,
  so unrelated secrets in the launching shell don't leak into it.

## [0.2.0] - 2026-06-04

### Added

- Create ECS resources from the UI: new clusters (with optional Container Insights), new
  task definitions from scratch (family, one or more containers with image / cpu / memory /
  port / command / env, launch type, network mode, and task roles), and new services (task
  definition, desired count, launch type, awsvpc networking, and an optional load-balancer
  target group). Plus a one-step "deploy image" on a service — registers a new task-def
  revision with the image swapped (env and secrets preserved) and rolls the service onto it.
- "Open in AWS console" buttons on the cluster, service, and task views (partition-aware:
  standard, GovCloud, and China consoles).
- A multi-cluster Overview — the home view — showing service health (failed / degraded /
  deploying / healthy) across every active scope and cluster, with a "needs attention"
  list that jumps straight to the affected service. Reachable from the tab bar, the
  command palette, or ⌘0.
- A per-service deployment timeline that merges the active deployments with the
  service-events feed into one chronological view, colour-coding revision changes,
  rollbacks, circuit-breaker trips, task churn, and health.
- ECS Exec: open an interactive shell into a running container from the task view. When a
  service doesn't have execute-command enabled, the terminal detects it and offers to
  enable it (a forced new deployment) in one click; containers without a shell can run an
  explicit command instead.
- Tail logs across every task in a service's log group, not just the latest, with a
  substring filter, log-level highlighting, and copy or download of the visible lines.
- A selectable metrics time range (1h, 6h, 24h, 7d) with deploy markers drawn on the
  charts, so a CPU, memory, or latency shift lines up with the rollout behind it.

### Changed

- Running a one-off task now accepts per-container command and environment overrides.
- The agent bounds each ECS read with a timeout so a slow call can't hang a turn, and
  stays within the AWS scopes you've activated. The chat input is now a single composer
  with an inline mode selector.

## [0.1.1] - 2026-06-03

### Fixed

- Agent detection now resolves the login-shell `PATH`, so coding agents installed via
  Homebrew, npm-global, nvm, or `~/.local/bin` (Claude Code, Codex, Gemini, …) are found
  when Mercek is launched from the Dock — and the connected harness is spawned with that
  `PATH` too.

## [0.1.0] - 2026-06-03

First public release. macOS (Apple Silicon and Intel).

### Added

- Multi-account / multi-region ECS discovery from `~/.aws` profiles, with opt-in scopes.
- Cluster, service, and task detail views (deployments, events, tasks, targets,
  scaling, metrics, right-sizing, env, networking, containers).
- Deployments & rollback: live rollout state, circuit-breaker status, one-click
  rollback, and cross-environment / cross-region service comparison.
- CloudWatch log tailing in the bottom drawer.
- Metrics (CPU / memory / ALB) via Container Insights with an AWS/ECS fallback, plus a
  Fargate cost estimate and right-sizing verdict.
- Topology map with edges inferred from task-definition environment variables.
- Sentinel: in-app detectors for drift, stalled deploys, flapping tasks, and OOM kills.
- ECR image vulnerability severity per service.
- Agent panel (read-only to AWS) over the Agent Client Protocol, with diff + confirm and
  equivalent-AWS-CLI handoff for proposed changes; chat history persisted locally.
- Command palette and keyboard navigation.
- Light and dark themes, with persisted table columns and CSV export.

[Unreleased]: https://github.com/utibeabasi6/mercek/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/utibeabasi6/mercek/releases/tag/v0.3.0
[0.2.0]: https://github.com/utibeabasi6/mercek/releases/tag/v0.2.0
[0.1.1]: https://github.com/utibeabasi6/mercek/releases/tag/v0.1.1
[0.1.0]: https://github.com/utibeabasi6/mercek/releases/tag/v0.1.0
