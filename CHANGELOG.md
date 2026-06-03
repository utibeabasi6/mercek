# Changelog

All notable changes to Mercek are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/utibeabasi6/mercek/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/utibeabasi6/mercek/releases/tag/v0.1.1
[0.1.0]: https://github.com/utibeabasi6/mercek/releases/tag/v0.1.0
