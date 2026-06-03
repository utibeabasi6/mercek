<div align="center">
  <img src="app-icon.svg" alt="Mercek" width="72" height="72" />
  <h1>Mercek</h1>
  <p><strong>A local-first desktop IDE for Amazon ECS.</strong></p>
  <p>
    <a href="https://github.com/utibeabasi6/mercek/actions/workflows/ci.yml"><img src="https://github.com/utibeabasi6/mercek/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" />
    <img src="https://img.shields.io/badge/platform-macOS-lightgrey.svg" alt="macOS" />
  </p>
</div>

Mercek is a desktop app for Amazon ECS. It uses the AWS credentials already on your
machine and shows your services across every account and region. It's read-only until
you approve a change, and it talks to AWS directly, with no server in between and no
telemetry.

![Mercek — a desktop IDE for Amazon ECS](mercek-site/public/screenshots/hero.png)

## Why

The AWS console is slow for everyday ECS work, and it's hard to see across accounts.
Mercek puts your services in one window so you can check rollouts, metrics, logs, cost,
and dependencies without switching tabs and accounts.

## Features

- **Multi-account, multi-region discovery** from your `~/.aws` profiles (SSO,
  assume-role, MFA, static keys), with opt-in per-profile scopes.
- **Service / cluster / task detail** — deployments, events, tasks, target health,
  autoscaling, metrics, right-sizing, environment, networking, containers.
- **Deployments & rollback** — live rollout state, circuit-breaker status, one-click
  rollback, and cross-environment / cross-region comparison.
- **Logs** — per-task CloudWatch log tail in a bottom drawer.
- **Metrics & cost** — CPU / memory / ALB via Container Insights with an AWS/ECS
  fallback; a Fargate cost estimate and a right-sizing verdict from real peaks.
- **Topology map** — internet → target group → service, plus dependency edges inferred
  from task-definition environment variables.
- **Sentinel** — a background watcher that flags drift, stalled deploys, flapping tasks,
  OOM kills, and image vulnerabilities.
- **Image security** — ECR vulnerability-scan severity per service image.
- **Agent panel** — connect your own coding agent (e.g. Claude Code) over the Agent
  Client Protocol. It's **read-only to AWS**; any change it proposes opens a
  diff-and-confirm dialog plus the equivalent AWS CLI command.
- **Keyboard-driven** — a ⌘K command palette and bindings throughout.

## Install

macOS (Apple silicon & Intel). Grab the latest `.dmg` from the
[releases page](https://github.com/utibeabasi6/mercek/releases), or build from source
below. Linux and Windows are on the roadmap.

## Security model

- **Read-only by default** — writes always go through a diff you confirm.
- **No credentials stored** — uses your existing AWS credential chain; resolved secrets
  are masked to ARNs and never written to disk.
- **No telemetry** — Mercek talks to your AWS account and nothing else.

See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## Build from source

```bash
git clone git@github.com:utibeabasi6/mercek.git
cd mercek
pnpm install
pnpm tauri dev     # run the app
```

Requires a recent Rust toolchain, pnpm, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

## Architecture

- **Backend** (`src-tauri/`, Rust): layered as `commands → discovery → resources → aws
  → domain`, with AWS SDK types confined below `resources/`.
- **Frontend** (`src/`, React 19 + TypeScript): feature-sliced under `features/`.
- **Type bridge**: Rust domain types export to TypeScript via `ts-rs`. Never hand-edit
  `src/types/generated/` — run `pnpm gen:types`.
- **Offline tests**: a compile-time `mock` cargo feature swaps in fixtures —
  `cargo test --features mock`.

More in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md). For questions, open a
[discussion](https://github.com/utibeabasi6/mercek/discussions).

## License

[MIT](./LICENSE) © Utibeabasi Umanah

Mercek is not affiliated with Amazon Web Services. ECS, Fargate, CloudWatch, and ECR are
trademarks of Amazon.com, Inc.
