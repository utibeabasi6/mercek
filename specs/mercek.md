# Mercek — Design Document

> Working name. A desktop IDE for AWS ECS, in the spirit of Lens/Freelens for Kubernetes. Built with Rust + Tauri + TanStack. Multi-account, multi-region, read + write, monospace-first, keyboard-driven.

This document is the build spec. It is meant to be handed to Claude Code as the source of truth. It defines scope, architecture, folder structure, the AWS integration surface, the UI/UX system, and the testing/quality bar. An agentic surface (connect Claude Code, à la Zed/Athas) is **out of scope for this build** but the layout reserves space for it; see §11.6.

---

## 1. Goals & non-goals

### Goals

- A single-binary desktop app that discovers ECS across many AWS accounts and regions and presents it as a navigable, fast, dense IDE.
- First-class read: capacity providers, clusters, services, tasks, task definitions, container instances, plus the resources ECS depends on (load balancers/target health, autoscaling, service discovery, CloudWatch metrics and logs).
- First-class write: scale/update services, force deployments, run/stop tasks, register task definitions, edit capacity provider strategy — all with explicit diff + confirm.
- Task introspection that beats the AWS console: resolved env (with secrets masked), full networking (ENI/IP/SG/subnet/VPC), volumes/mounts, per-container ports, and live logs.
- UX on the level of Zed/Athas: instant navigation, command palette, minimal chrome, monospace throughout, no spinners where polling can be silent.

### Non-goals (this build)

- No agent/Claude Code integration yet (reserve the panel, build nothing).
- No EKS/Kubernetes. No Lambda. No general AWS console.
- No write paths for IAM, VPC, or ASG lifecycle (we read them, we link out for edits).
- No multi-user/collab, no cloud sync. Local-only app.

---

## 2. Target user & core flows

Operators and platform engineers who live in ECS daily and currently bounce between the AWS console, `aws ecs` CLI, and CloudWatch. Primary flows:

1. **Launch → scope.** Auto-detect AWS profiles; user picks which profiles + regions to activate. App fans out and discovers everything.
2. **Navigate.** Tree of `account → cluster → {capacity providers, services, tasks, container instances}`. Open anything in a tab.
3. **Diagnose a service.** Deployment/rollout state, events feed, target health, autoscaling, CPU/mem/request metrics, failing tasks — on one screen.
4. **Inspect a task.** Containers, resolved env, networking, mounts, exit codes, live logs per container.
5. **Act.** Scale, force new deployment, stop a task, run a one-off task — each with a previewed diff and confirmation.

---

## 3. Product principles

- **Speed is a feature.** Native Rust for all AWS work and heavy transforms. The webview only renders. Target: tree interactions and tab switches under one frame of perceived latency; data arrives by background polling, not blocking loads.
- **Density over decoration.** Monospace everywhere. Tabular data is tabular. Minimal borders, no gradients, no shadows-as-decoration. Information per pixel is high, à la Lens/Freelens, but with Zed's restraint.
- **Keyboard-first.** Everything reachable via command palette (`Cmd/Ctrl-K`) and quick-open (`Cmd/Ctrl-P`). Mouse is optional.
- **Silent refresh.** Polling updates rows in place; no full-screen spinners after first paint. Stale data is shown with a subtle freshness indicator, never hidden behind a loader.
- **Destructive actions are explicit.** Every write shows a diff and a typed/confirmed action. No silent mutations.
- **No surprises with credentials.** The app never stores AWS secrets. It uses the standard provider chain and surfaces re-auth (SSO expiry) clearly.

---

## 4. Tech stack

| Layer       | Choice                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell       | Tauri 2.x                                                                                                                                                                                                                                                           |
| Backend     | Rust (stable, edition 2021), Tokio runtime                                                                                                                                                                                                                          |
| AWS         | `aws-config`, `aws-sdk-ecs`, `aws-sdk-cloudwatch`, `aws-sdk-cloudwatchlogs`, `aws-sdk-ec2`, `aws-sdk-elasticloadbalancingv2`, `aws-sdk-applicationautoscaling`, `aws-sdk-servicediscovery`, `aws-sdk-sts`, `aws-sdk-ssm` (env resolution), `aws-sdk-secretsmanager` |
| Frontend    | React 18 + TypeScript, Vite                                                                                                                                                                                                                                         |
| Routing     | TanStack Router (type-safe, code-based routes)                                                                                                                                                                                                                      |
| Data        | TanStack Query (server cache, polling, mutations)                                                                                                                                                                                                                   |
| Tables      | TanStack Table + TanStack Virtual (large task/service lists)                                                                                                                                                                                                        |
| Forms       | TanStack Form (create/edit flows)                                                                                                                                                                                                                                   |
| Charts      | uPlot (fast, tiny, canvas) for metric series; no heavy chart lib                                                                                                                                                                                                    |
| Styling     | Tailwind v4 with a custom token layer (CSS variables), monospace stack                                                                                                                                                                                              |
| Type bridge | `ts-rs` — generate TS types from Rust domain structs at build time                                                                                                                                                                                                  |
| Logging     | `tracing` + `tracing-subscriber` (backend), structured                                                                                                                                                                                                              |
| Errors      | `thiserror` for typed errors, `anyhow` only at command boundaries                                                                                                                                                                                                   |

Rationale for ts-rs: the IPC contract is defined once in Rust. Generated `.ts` is the only place frontend types come from; no hand-written duplicates, no drift.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Webview (React + TanStack)                                    │
│  routes ─ features ─ ui primitives                            │
│  TanStack Query cache  ◀── polling / mutations                │
└───────────────▲───────────────────────────┬──────────────────┘
                │ typed invoke()             │ Tauri events / channels
                │ (commands)                 │ (log tail, metric stream)
┌───────────────┴───────────────────────────▼──────────────────┐
│ Rust core (Tauri)                                             │
│                                                               │
│  commands/      thin IPC handlers, serialize Result           │
│       │                                                       │
│  discovery/     multi-account/region fan-out orchestration    │
│       │                                                       │
│  resources/     per-service: fetch + mutate + map             │
│   ecs · cloudwatch · logs · elb · autoscaling · cloudmap · ec2│
│       │                                                       │
│  aws/           profile parsing, credential providers,        │
│                 client pool, retry/throttle, pagination       │
│                                                               │
│  domain/        pure types (serde + ts-rs), SDK-independent   │
│  streaming/     channel-backed live data (logs, metrics)      │
│  state.rs       AppState held by Tauri (client pool, config)  │
│  error.rs       typed AppError → serializable                 │
└───────────────────────────────────────────────────────────────┘
```

Data flow rules:

- The webview never talks to AWS. All SDK calls live in Rust.
- `commands/` is a thin boundary: deserialize args → call into `discovery`/`resources` → return a `domain` type. No business logic in commands.
- `resources/*` modules own SDK access for one AWS service each and expose a trait (the testable seam, §13). They map SDK shapes into `domain` types via `map.rs` so SDK types never cross the IPC boundary.
- Live/streaming data (log tail, metric polling at sub-second cadence) uses Tauri **channels**, not request/response. Everything else is `invoke` + TanStack Query polling.

---

## 6. AWS integration

### 6.1 Profile discovery & credentials

- Parse `~/.aws/config` and `~/.aws/credentials` (respect `AWS_CONFIG_FILE` / `AWS_SHARED_CREDENTIALS_FILE`). List all profiles with their type: static, `sso_session` / legacy SSO, `assume_role` (`role_arn` + `source_profile`), `credential_process`, MFA.
- Do **not** reimplement credential resolution. Build clients via `aws_config::from_env().profile_name(...)` so the SDK's provider chain handles SSO token cache, role assumption, MFA prompts, and `credential_process`.
- On launch, present discovered profiles; user selects which to activate. Per activated profile, resolve the account ID via STS `GetCallerIdentity` (also validates creds and surfaces expiry).
- **SSO expiry** is a first-class state. When a call returns an expired/forbidden SSO token, mark the profile `needs-reauth` and surface a banner with the exact `aws sso login --profile X` command. Never attempt to mint tokens ourselves.

### 6.2 Regions

- **Region selection is opt-in.** At startup the user explicitly picks which regions to scope per activated profile — the app never auto-scans all regions. To assist selection, surface the profile's configured region plus the account's enabled regions (EC2 `DescribeRegions`) as choices, but nothing is queried until the user opts in. This is the primary guard against accidental org-wide API storms.
- The selection (activated profiles + their regions) is **persisted** (see §12.1) and reused on next launch without re-prompting; the user can edit the scope at any time from the scope selector, which re-runs discovery only for the delta.
- The unit of scope is the **(profile, region)** pair. The client pool is keyed on it.

### 6.3 Resource discovery (fan-out)

Per (profile, region):

1. ECS `ListClusters` → `DescribeClusters` (with `settings`, `statistics`, `attachments`).
2. Per cluster: `ListServices` → `DescribeServices` (batched 10); `ListTasks` (by cluster, by service, by status) → `DescribeTasks` (batched 100); `ListContainerInstances` → `DescribeContainerInstances`; capacity providers from the cluster's `capacityProviders` + `DescribeCapacityProviders`.
3. Task definitions: `DescribeTaskDefinition` per referenced revision (cached hard — task defs are immutable per revision).
4. Dependent resources, lazily (on detail open, not during initial discovery):
   - ELBv2: `DescribeTargetGroups` + `DescribeTargetHealth` for service load balancers.
   - Application Auto Scaling: `DescribeScalableTargets` + `DescribePolicies` (` resourceId = service/<cluster>/<service>`).
   - Cloud Map: `ServiceDiscovery` for `serviceRegistries`.
   - EC2: `DescribeNetworkInterfaces`, `DescribeSecurityGroups`, `DescribeSubnets` for task ENIs.

Concurrency:

- Bounded parallelism per (profile, region) using a semaphore (default 8 in-flight). Never unbounded fan-out — that's how you get throttled across an org.
- Discovery returns progressively: emit clusters first, then fill services/tasks via events so the tree paints immediately.

### 6.4 Throttling & retry

- Use the SDK's **adaptive retry** mode with a raised max-attempts. On top of that, treat `ThrottlingException`/`RequestLimitExceeded` as a signal to back off the discovery semaphore globally (token-bucket in `aws/retry.rs`).
- Surface a throttle indicator in the status bar when backoff is active. Never hammer silently.

### 6.5 Live data

- ECS has no watch API. Use polling with per-resource cadence:
  - Service/deployment state, events: 5s while a deployment is in progress, 15–30s otherwise.
  - Task lists: 10s.
  - Metrics: 30–60s (CloudWatch resolution).
- **Logs:** prefer CloudWatch Logs `StartLiveTail` (streaming) when available; fall back to `FilterLogEvents` polling. Stream to the webview over a Tauri channel. Per-container log group/stream comes from the task def `logConfiguration` (`awslogs`).
- **Metrics:** `GetMetricData` batched (up to 500 queries/call). For services: `CPUUtilization`, `MemoryUtilization`, plus ALB `RequestCount`/`TargetResponseTime`/`HTTPCode_Target_5XX` when a target group is attached. **Source priority:** use Container Insights metrics (`ECS/ContainerInsights`) when the cluster has them enabled — they're richer (per-task, network, storage). Fall back to base `AWS/ECS` otherwise. When a cluster is on the base namespace, surface a non-blocking nudge in the cluster/metrics view ("Container Insights off — limited metrics; enable for per-task detail") with a link to the enable docs. The nudge is informational, never a modal, and dismissible per cluster.

### 6.6 Mutations (write paths)

Each is a command that returns a **planned diff** first, then executes on confirm:

- Scale service: `UpdateService` desiredCount.
- Update service: task def revision, deployment config (min/max healthy %), `forceNewDeployment`.
- Force new deployment (rolling restart).
- Stop task: `StopTask` (with reason).
- Run task: `RunTask` (one-off; pick task def, count, launch type, network config, overrides).
- Register task definition: `RegisterTaskDefinition` (from an existing revision + edits; show JSON diff).
- Capacity provider strategy: `PutClusterCapacityProviders` / `UpdateService` strategy.

Confirmation contract: the UI shows a structured before/after, the user confirms, the command executes, and the affected resource's query is invalidated so the row updates from the next poll.

### 6.7 ECS Exec (phase later, but design the seam now)

Interactive shell into a running container (`ExecuteCommand` over SSM). This needs an SSM session websocket/`session-manager-plugin`-equivalent and is the most complex single feature. Reserve a bottom-drawer terminal surface (§11.5) and a `streaming/exec.rs` module placeholder. Do not implement in this build.

---

## 7. Domain model

All types live in `domain/`, derive `serde::{Serialize, Deserialize}` + `ts-rs::TS`, and are SDK-independent. Core entities:

- `AwsProfile { name, kind, region_default, account_id, status }`
- `Scope { profile, region }`
- `Cluster { arn, name, status, capacity_providers, default_strategy, stats, settings }`
- `CapacityProvider { name, kind (Fargate|FargateSpot|Asg), status, managed_scaling, asg_arn }`
- `Service { arn, name, cluster, status, desired, running, pending, launch_type, deployments[], task_def_arn, load_balancers[], registries[], events[] }`
- `Deployment { id, status, rollout_state, desired, running, pending, created_at, task_def }`
- `Task { arn, group, cluster, service?, last_status, desired_status, health, containers[], attachments (eni), cpu, memory, started_at, stopped_reason }`
- `Container { name, image, last_status, health, exit_code, reason, network_bindings[], log_group, log_stream }`
- `TaskDefinition { family, revision, cpu, memory, network_mode, container_defs[], volumes[], roles }`
- `ContainerDef { name, image, env[], secrets[], port_mappings[], mount_points[], log_config }` — `secrets[]` are references (SSM/Secrets Manager ARNs), never resolved values, until explicitly requested.
- `Networking { eni_id, private_ip, public_ip?, subnet, vpc, security_groups[] }`
- `TargetHealth`, `ScalingTarget`, `ScalingPolicy`, `MetricSeries`, `LogEvent`.

Secret handling: `EnvVar { key, value }` vs `SecretRef { key, source_arn }`. Resolved secret values are fetched only via an explicit `reveal_secret` command, returned once, never cached, and the UI masks by default.

---

## 8. IPC contract

- One typed `invoke` wrapper on the frontend (`lib/tauri.ts`) generated/aligned to the command list; every command name and its arg/return types are typed.
- Commands return `Result<T, AppError>`; `AppError` is a serializable enum (`Throttled`, `AuthExpired { profile }`, `Forbidden`, `NotFound`, `Aws { service, code, message }`, `Internal`). The frontend maps these to typed UI states (e.g. `AuthExpired` → re-auth banner).
- Channels for streams: `logs:tail:{taskArn}:{container}` and `metrics:{resource}` carry append-only events.

---

## 9. Backend folder structure (`src-tauri/`)

```
src-tauri/
  Cargo.toml
  build.rs
  tauri.conf.json
  capabilities/
    default.json                 # scoped Tauri permissions
  src/
    main.rs                      # entrypoint, panic hook, tracing init
    lib.rs                       # Tauri builder, command registry, state setup
    state.rs                     # AppState: ClientPool, AppConfig, discovery cache
    error.rs                     # AppError (thiserror), serde-serializable

    commands/                    # IPC boundary — thin, no logic
      mod.rs
      profiles.rs                # list/activate profiles, regions
      discovery.rs               # trigger + stream discovery
      clusters.rs
      services.rs                # read + mutations (scale, update, deploy)
      tasks.rs                   # read, stop, run
      task_defs.rs               # describe, register
      metrics.rs
      logs.rs                    # start/stop tail (channel)
      secrets.rs                 # reveal_secret (one-shot)

    aws/                         # infrastructure
      mod.rs
      profiles.rs                # parse ~/.aws config+credentials
      client_pool.rs             # (profile, region) -> SdkClients, cached
      credentials.rs             # provider chain wiring, caller identity
      retry.rs                   # adaptive backoff + global throttle bucket
      pagination.rs              # generic paginate helpers
      batch.rs                   # chunk(10/100) helpers for Describe* calls

    discovery/                   # orchestration / fan-out
      mod.rs
      orchestrator.rs            # semaphore-bounded fan-out, progressive emit
      graph.rs                   # resource relationship assembly

    resources/                   # one module per AWS service
      mod.rs
      ecs/
        mod.rs
        client.rs                # EcsClient trait + impl (testable seam)
        fetch.rs                 # list/describe -> domain
        mutate.rs                # update/run/stop/register
        map.rs                   # SDK shape -> domain type
      cloudwatch/
        mod.rs · client.rs · fetch.rs · map.rs
      logs/
        mod.rs · client.rs · tail.rs · map.rs
      elb/
        mod.rs · client.rs · fetch.rs · map.rs
      autoscaling/
        mod.rs · client.rs · fetch.rs · map.rs
      cloudmap/
        mod.rs · client.rs · fetch.rs · map.rs
      ec2/
        mod.rs · client.rs · fetch.rs · map.rs   # ENI/SG/subnet/VPC

    domain/                      # pure types, serde + ts-rs
      mod.rs
      profile.rs · cluster.rs · service.rs · task.rs
      task_def.rs · networking.rs · metric.rs · log.rs
      scaling.rs · target_health.rs

    streaming/
      mod.rs
      logs.rs                    # channel-backed log tailing
      metrics.rs                 # channel-backed metric polling
      exec.rs                    # ECS Exec seam (stub for now)

    db/                          # SQLite persistence (rusqlite, bundled)
      mod.rs
      pool.rs                    # connection handle in AppState
      migrations.rs              # versioned schema migrations
      snapshots.rs               # read/write discovered graph per (profile,region)
      metrics_cache.rs           # rolling metric time-series
      scope.rs                   # activated profiles + selected regions

    config/
      mod.rs                     # app prefs / UI state (tabs, theme, column config)
      store.rs                   # prefs persistence (DB-backed; no creds, no secrets)

  tests/                         # integration tests
    discovery_fan_out.rs
    profile_parsing.rs
    mappers.rs
    mutation_diff.rs
    support/
      mock_clients.rs            # trait impls returning fixtures
      fixtures/                  # captured Describe* JSON
```

Layering law: `commands → discovery → resources → aws → domain`. Dependencies point inward. `domain` depends on nothing app-specific. `resources/*` never leaks SDK types upward.

---

## 10. Frontend folder structure (`src/`)

```
src/
  main.tsx
  app/
    router.tsx                   # TanStack Router tree
    providers.tsx                # QueryClient, theme, command-palette ctx
    keybindings.ts               # global shortcut registry
  routes/
    __root.tsx                   # shell: rail + workspace + drawer + statusbar
    index.tsx                    # empty state / profile picker
    cluster.$id.tsx
    service.$id.tsx
    task.$id.tsx
    capacity-provider.$id.tsx
  features/
    profiles/
      api/                       # invoke wrappers + query/mutation hooks
      components/                # ProfilePicker, RegionSelect, ReauthBanner
      hooks/
      types.ts                   # re-export generated types
    discovery/
    clusters/
    services/                    # ServiceOverview, DeploymentTimeline, EventsFeed,
      api/ · components/ · hooks/   #   TargetHealth, ScalingPanel, ServiceActions
    tasks/                       # TaskList, TaskDetail, EnvTable, NetworkingPanel,
      api/ · components/ · hooks/   #   ContainersPanel, RunTaskDialog
    task-defs/
    metrics/                     # MetricChart (uPlot), Sparkline
    logs/                        # LogViewer (virtualized), tail controls
  components/
    ui/                          # design system primitives
      Button.tsx · Tabs.tsx · Tree.tsx · DataTable.tsx · Drawer.tsx
      CommandPalette.tsx · StatusBar.tsx · Badge.tsx · DiffView.tsx
      Sparkline.tsx · KbdHint.tsx · Field.tsx
    layout/
      AppShell.tsx · LeftRail.tsx · Workspace.tsx · TabBar.tsx
      RightPanel.tsx             # reserved for agent surface (§11.6)
  lib/
    tauri.ts                     # typed invoke + channel subscribe
    query-keys.ts                # central query key factory
    query-client.ts              # cache + per-resource refetch policy
    format.ts                    # arns, durations, bytes, relative time
    arn.ts                       # parse/format ARNs
  types/
    generated/                   # ts-rs output — DO NOT EDIT
  styles/
    tokens.css                   # design tokens (CSS variables)
    globals.css
  test/
    setup.ts
    mock-tauri.ts                # invoke/channel mock harness
```

Feature-sliced: each feature owns its `api` (hooks over `invoke`), `components`, `hooks`, `types`. Shared primitives live in `components/ui`. Generated types are imported, never edited.

---

## 11. UI / UX

Reference points: Lens/Freelens for the resource-tree + detail-panel paradigm, Zed for speed/restraint and the bottom-drawer terminal, Athas for the tabbed workspace, command palette, and the reserved right-side agent panel.

### 11.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ titlebar:  ◎ profile▾  region▾   [ search / Cmd-K ]            [ agent ⌘ ] │
├────────────┬──────────────────────────────────────────────┬───────────────┤
│ LEFT RAIL  │ WORKSPACE (tabs)                              │ RIGHT PANEL   │
│            │ ┌─ svc:web ─┬─ task:a1b2 ─┬─ + ──────────────┐│ (reserved for │
│ ▸ acct A   │ │ overview · deployments · events · metrics ││  agent — see  │
│   ▾ prod   │ │ ─────────────────────────────────────────┐││  11.6; empty  │
│     ▸ caps │ │  desired 4   running 4   pending 0        │││  / hidden in  │
│     ▾ svcs │ │  rollout: COMPLETED                       │││  this build)  │
│       web  │ │  [tasks table — virtualized]             │││               │
│       api  │ │                                          │││               │
│     ▸ tasks│ │                                          │││               │
│ ▸ acct B   │ └──────────────────────────────────────────┘││               │
├────────────┴──────────────────────────────────────────────┴───────────────┤
│ DRAWER:  logs · events · terminal(exec, later)        [tail ●] [wrap] [⤓]   │
├────────────────────────────────────────────────────────────────────────────┤
│ STATUS:  acct 1234…  us-east-1  ·  12 clusters  ·  ⟳ 8s ago  ·  throttle ○  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Left rail:** scope selector (profile + region) pinned at top; below it the resource tree `account → cluster → {capacity providers · services · tasks · container instances}`. Collapsible, keyboard-navigable, with inline status glyphs (running/degraded/draining).
- **Workspace:** editor-style tabs. Opening any tree node opens or focuses a tab. Each tab is a resource detail view with its own sub-tabs.
- **Right panel:** reserved for the future agent. In this build it is hidden/empty; do not build it, but keep `RightPanel.tsx` and the layout slot so adding it later is non-structural.
- **Drawer:** bottom, toggleable — logs, events, and (later) exec terminal. Mirrors Zed's terminal drawer.
- **Status bar:** account id, region, resource counts, last-refresh age, throttle indicator.

### 11.2 Navigation

- `Cmd/Ctrl-K` command palette: every action (scale service, force deploy, switch region, run task, reveal env, tail logs…) is a command.
- `Cmd/Ctrl-P` quick-open: fuzzy jump to any resource by name/ARN across active scopes.
- `Cmd/Ctrl-1..9` focus tabs; `Cmd/Ctrl-W` close tab; `Cmd/Ctrl-R` force refresh current view.

### 11.3 Detail views

- **Cluster:** counts, capacity providers + strategy, container instances, settings (Container Insights), cluster-level metrics.
- **Service:** `overview` (desired/running/pending, rollout state, deployment timeline), `deployments`, `events` (service event feed), `tasks` (virtualized table), `targets` (target group health), `scaling` (scalable target + policies), `metrics` (CPU/mem + ALB request/latency/5xx). Action bar: scale, update, force deploy.
- **Task:** `containers` (image, status, exit code/reason, port bindings), `env` (masked secrets, reveal-on-click), `networking` (ENI, private/public IP, subnet, VPC, security groups), `volumes/mounts`, `logs` (per container). Action: stop task.
- **Capacity provider:** kind, status, managed scaling settings, linked ASG (read-only link to console for ASG edits).
- **Task definition:** rendered view + read-only raw JSON, revision switcher. Editing for the **first write release is a structured form over the common fields only** — container image, env vars, secret refs, cpu/memory, port mappings — which covers the overwhelming majority of day-to-day changes and is safe to validate field-by-field. "Register new revision from this" takes the existing revision, applies the form edits, shows a JSON diff, and confirms → `RegisterTaskDefinition`. A full raw-JSON editor with whole-document schema validation against the ECS task-def schema is deferred to a later phase (it widens the validation/blast-radius surface a lot); until then, raw JSON stays read-only.

### 11.4 Tables

TanStack Table + Virtual. Sortable, filterable, column-configurable. Sticky header, monospace columns, status glyphs, relative timestamps. Handles thousands of tasks without lag.

### 11.5 Logs & drawer

Virtualized log viewer, live tail toggle, level/keyword filter, wrap toggle, jump-to-latest, copy/export. Tail streams over a channel; no polling stutter.

### 11.6 Agent panel (reserved, not built)

Athas/Zed put the agent on the right. We reserve that slot. This build ships it hidden. When added later it will connect to Claude Code over ACP and operate against the active AWS scope. Constraint for now: keep the layout, keybinding slot (`agent ⌘`), and `RightPanel.tsx` stub in place so enabling it is additive, not a refactor.

### 11.7 Visual system / tokens

- **Type:** monospace everywhere. Stack: `"Berkeley Mono", "JetBrains Mono", "Geist Mono", ui-monospace, monospace`. One family, weight + size carry hierarchy.
- **Theme:** dark-first, light as a secondary theme; both from the same token set.
- **Tokens** (CSS variables in `tokens.css`): `--bg`, `--bg-elev`, `--border`, `--fg`, `--fg-dim`, `--fg-muted`, `--accent`, plus status colors `--ok`, `--warn`, `--err`, `--info`, `--draining`. Single accent; status colors used sparingly and consistently (green=running/healthy, amber=pending/in-progress, red=failed/unhealthy, blue=info, grey=draining/stopped).
- **Chrome:** 1px borders, no drop shadows for decoration (shadows only for true overlays: palette, dialogs, drawer). No gradients. Tight, consistent spacing scale (4px base).
- **Motion:** near-none. Tab/drawer transitions ≤120ms. No spinners post-first-paint; freshness shown as a small "⟳ Ns ago" in the status bar and per-view.

---

## 12. State & data fetching

### 12.1 Frontend cache (live)

- TanStack Query is the single server-state cache. Query keys via a central factory (`query-keys.ts`), namespaced by `(profile, region, resourceType, id)`.
- Per-resource refetch policy in `query-client.ts`: services 15–30s (5s during active deployment), tasks 10s, metrics 30–60s, task defs effectively infinite (immutable).
- Mutations invalidate the precise affected keys; UI updates from the next poll rather than optimistic guessing (ECS state is authoritative and lags slightly anyway).
- Streams (logs/metrics tail) bypass Query and feed component state via the channel subscription in `lib/tauri.ts`.

### 12.2 Persistence (cold-start cache + prefs)

A local **SQLite** store (Rust side, `db/`) backs instant cold-start and survives restarts. SQLite is the choice over an in-memory-only Phase 1 and over a pure-KV store because the cache benefits directly from SQL: filter/search cached resources offline, store metric history as a queryable time-series table, and evolve schema with ordinary migrations. Use `rusqlite` with the bundled feature (no system dependency, clean cross-compile) and `refinery` (or hand-rolled versioned) migrations. (If avoiding the C dependency ever matters, `redb` is the sanctioned pure-Rust swap — embedded, ACID, zero-copy — at the cost of writing range queries by hand. SQLite is the default.)

What it stores:

- **Scope:** activated profiles and their selected regions (§6.2) — restored on launch, no re-prompt.
- **Resource snapshots:** last-known discovered graph per `(profile, region)`, written after each discovery pass. On launch the UI hydrates from the snapshot immediately (stale, marked with a freshness age), then a background refresh reconciles. This is what makes startup feel instant on large orgs.
- **Metric history:** optional rolling window of fetched metric series, so charts render on cold start before CloudWatch responds.
- **UI state:** open tabs, tree expansion, theme, column config.

Hard rule: the store **never holds credentials or resolved secret values** — only resource metadata and UI state. Snapshot rows carry a TTL/eviction policy so the cache can't silently serve very stale data as if live.

### 12.3 Freshness & refresh policy

The snapshot is kept current by three mechanisms working together, all of them subordinate to the global throttle bucket (§6.4) — refreshing must never become the org-wide storm §6.2 guards against.

1. **Write-through from live polls.** While the app is open, every completed TanStack Query poll persists its result to the snapshot (batched/debounced per `(profile,region)`). The on-disk cache is therefore never older than the last poll of whatever the user is looking at — no separate "save" step, no drift between what's on screen and what's cached.
2. **Volatility-tiered staleness.** Every snapshot row stores `fetched_at` and a staleness class. The UI shows a freshness age and visibly marks a row stale once it passes its `stale_after`. Tasks go stale fast; immutable task definitions never do. Polling cadence and `stale_after` are kept in sync (one source of truth in `query-client.ts`, mirrored by the writer in `db/`).
3. **Volatility-ordered reconciliation.** On cold-start and on scope changes, the background refresh fetches in priority order — most volatile first — so the data most likely to be wrong is corrected first.

Per-resource cadence (focused = the scope/tab in view; background = activated but unfocused scopes, throttled down to avoid hammering every region):

| Resource               | Focused poll              | Background poll       | `stale_after` | Notes                           |
| ---------------------- | ------------------------- | --------------------- | ------------- | ------------------------------- |
| Tasks                  | 10s (5s during deploy)    | 60–120s               | 15s           | most volatile; reconciled first |
| Services / deployments | 15–30s (5s during deploy) | 60s                   | 30s           | service events + rollout state  |
| Target health          | 15–30s                    | on-focus              | 30s           | tracks task churn               |
| Container instances    | 30s                       | 120s                  | 60s           | EC2 launch type only            |
| Clusters (list/stats)  | 30–60s                    | 120s                  | 2m            |                                 |
| Metrics                | 30–60s                    | paused when unfocused | 60s           | CloudWatch resolution-bound     |
| Capacity providers     | 60s                       | on-focus              | 5m            | change rarely                   |
| Task definitions       | none (immutable)          | none                  | never         | cached forever per revision     |

Refinements:

- **Active deployments accelerate.** When a service has an in-progress deployment, its tasks/service/target-health drop to the 5s tier until the rollout reaches `COMPLETED`/`FAILED`, then relax. This is the one place we deliberately poll hard, because it's where the user is watching.
- **Unfocused scopes degrade, not stop.** Focused scope polls at full cadence; other activated scopes run a slow heartbeat (or refetch-on-focus) so switching tabs shows near-fresh data without continuously querying every account/region. `refetchOnWindowFocus` is on for the focused scope.
- **Hard eviction.** Past a max age (e.g. tasks/services beyond a few minutes of no refresh, or the whole snapshot beyond a session gap), rows are treated as expired: the UI shows "cache expired — refreshing" rather than rendering stale state as current, and forces a foreground reconcile.
- **Backpressure wins.** If the throttle bucket is constricted, background refreshes are shed first (focused view keeps priority), and the status-bar throttle indicator reflects it. Freshness is best-effort under throttling, never at the cost of an API storm.

---

## 13. Testing

Non-negotiable: the codebase ships with tests, and the AWS layer is built around a mockable seam.

### Backend (Rust)

- **Seam:** each `resources/<svc>/client.rs` defines a trait (e.g. `EcsApi`) with a real SDK impl and a mock impl. `fetch`/`mutate` depend on the trait, not the concrete SDK client. This is what makes the core unit-testable without network.
- **Unit tests** (in-module `#[cfg(test)]`): `aws/profiles.rs` parsing (SSO, assume-role, credential_process, MFA, malformed), `resources/*/map.rs` SDK→domain mappers, `aws/retry.rs` backoff/bucket math, `mutate` diff generation.
- **Property tests** (`proptest`): ARN parse/format round-trips, mapper totality on arbitrary inputs.
- **Integration tests** (`tests/`): drive `discovery::orchestrator` against `support/mock_clients.rs` backed by captured `Describe*` JSON fixtures; assert the assembled resource graph and progressive emission order. Bound-concurrency and throttle-backoff behavior tested against a mock that returns `ThrottlingException`.
- Coverage focus: mappers, profile parsing, discovery orchestration, mutation diffs, error→`AppError` classification. (Not chasing a %; these are the correctness-critical seams.)

### Frontend

- **Vitest + React Testing Library.** `test/mock-tauri.ts` mocks `invoke` and channel subscriptions. Test feature hooks with a test `QueryClient`, components in isolation, and the command palette/keybinding registry.
- Reducers/format utils (`arn.ts`, `format.ts`) unit-tested.

### E2E

- `tauri-driver` + WebdriverIO against a built app with the Rust layer pointed at a mock/fixture backend (env flag swaps the client impls to fixtures). Smoke flows: launch → pick profile → tree populates → open service → scale (diff + confirm) → see updated count.

CI runs: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo deny check`; `tsc --noEmit`, `eslint`, `vitest run`; ts-rs generation verified clean (no drift).

---

## 14. Code quality conventions

- **No filler comments.** Comment _why_, never _what_. No banner comments, no restating the line below in prose, no "// TODO: implement" left in shipped code. Names carry intent; if a comment explains what the code does, rename instead.
- **Errors:** `thiserror` typed errors per module; `anyhow` only at the `commands/` boundary where it converts to `AppError`. No `unwrap()`/`expect()` in non-test code except documented invariants.
- **Functions small, modules focused.** A `resources/<svc>` module does fetch/mutate/map and nothing else. `commands` stay thin.
- **No SDK types above `resources/`.** Map at the boundary.
- **Formatting/lint enforced in CI** (rustfmt, clippy `-D warnings`, eslint, prettier). Conventional commits, commitlint.
- **Generated code is generated.** `types/generated/` and any ts-rs output are never hand-edited; regeneration is part of the build.
- TS strict mode on; no `any` at API boundaries (generated types only).

---

## 15. Security & privacy

- App never persists AWS credentials or secret values. Credentials resolve through the SDK chain at runtime.
- Resolved secret values: fetched only on explicit `reveal_secret`, returned once, never cached or logged, masked by default in the UI.
- No telemetry. No network egress except to AWS endpoints for the active scopes.
- Tauri capabilities scoped to the minimum (no broad fs/shell). `capabilities/default.json` grants only what commands need.
- Logs (tracing) redact secret-shaped values; ARNs are fine, values are not.

---

## 16. Build, release, CI

- Tauri bundler for macOS (signed/notarized), Linux (AppImage + deb), Windows (later).
- GitHub Actions: lint + test matrix on push; tagged releases build + sign + publish artifacts.
- Reproducible: pinned toolchain via `rust-toolchain.toml`, locked `Cargo.lock` and `pnpm-lock.yaml`.

---

## 17. Roadmap / phasing

**Phase 0 — skeleton.** Tauri shell, design tokens, app layout (rail/workspace/drawer/statusbar + reserved right panel), command palette, ts-rs pipeline, mock-backed discovery so the UI is buildable before AWS is wired.

**Phase 1 — read.** Profile discovery + activation, opt-in scope selection persisted to SQLite, STS identity, (profile,region) client pool, ECS discovery fan-out with snapshot cache for instant cold-start, tree + cluster/service/task detail views, env + networking panels, target health, scaling read, metrics (Container Insights with base-`AWS/ECS` fallback + nudge), log tail.

**Phase 2 — write.** Scale, update, force deploy, stop/run task, register task def — all diff+confirm.

**Phase 3 — polish.** Multi-account performance, throttle handling under load, light theme, column config persistence, export.

**Phase 4 — exec.** ECS Exec terminal in the drawer.

**Phase 5 — agent.** Light up the reserved right panel; connect Claude Code over ACP against the active scope. (Separate spec.)

---

## 18. Resolved decisions

These were open during scoping and are now settled. Recorded here so the rationale travels with the build.

- **Region scope — opt-in, persisted.** No auto-scan of all regions. User selects regions per activated profile at startup; selection is cached in SQLite and restored on next launch, editable anytime with delta-only re-discovery. Primary guard against org-wide API storms. (§6.2)
- **Metrics source — Container Insights first, base fallback, with nudge.** Use `ECS/ContainerInsights` when enabled; fall back to `AWS/ECS`. When a cluster is on the base namespace, show a dismissible, non-blocking "Insights off" nudge linking to enable docs. (§6.5)
- **Task-def editing — structured form first.** First write release edits only the common fields (image, env, secret refs, cpu/mem, ports) via a validated structured form; raw JSON stays read-only; "register new revision" shows a diff before `RegisterTaskDefinition`. Full raw-JSON editing with whole-document schema validation is deferred to a later phase. (§11.3)
- **Persistence — SQLite.** Ship Phase 1 with a SQLite snapshot cache (`rusqlite`, bundled) for instant cold-start, scope persistence, and queryable metric history — not in-memory-only. `redb` is the sanctioned pure-Rust alternative if the C dependency ever becomes a constraint. Never stores credentials or resolved secrets. (§12.2)
