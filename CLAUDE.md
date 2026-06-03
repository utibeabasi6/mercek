# Mercek

A desktop IDE for AWS ECS (Tauri 2 + Rust backend, React 19 + TypeScript frontend). The full build spec is `specs/mercek.md` — **it is the source of truth** for scope, architecture, and conventions.

## Commands

```bash
pnpm install            # frontend deps (package manager is pnpm)
pnpm tauri dev          # run the desktop app (Vite + Rust)
pnpm build              # frontend typecheck + bundle (tsc && vite build)
pnpm gen:types          # regenerate src/types/generated from Rust (ts-rs)
pnpm exec tsc --noEmit  # frontend typecheck only

cargo build  --manifest-path src-tauri/Cargo.toml                    # backend (real AWS/harness only)
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
cargo test   --manifest-path src-tauri/Cargo.toml --features mock    # full offline suite + ts-rs export
cargo test   --manifest-path src-tauri/Cargo.toml                    # ts-rs export + non-mock unit tests
```

## Type bridge (ts-rs)

Rust domain types in `src-tauri/src/domain/` and `error.rs` derive `ts_rs::TS` with
`#[ts(export, export_to = "../../src/types/generated/")]`. `cargo test` (or `pnpm gen:types`)
regenerates the TS. **Never hand-edit `src/types/generated/`**; import via `@/types`.
Structs use `#[serde(rename_all = "camelCase")]` → TS fields are camelCase; enum variants are
`snake_case` → TS string-union values are snake_case (e.g. `rolloutState === "in_progress"`).

## Layout

- Backend layering law (deps point inward): `commands → discovery → resources → aws → domain`.
  `commands/` is thin (no logic); no SDK types above `resources/`.
- Frontend is feature-sliced: `features/<feature>/{api,components}`; shared primitives in
  `components/ui` and `components/layout`; `@/` aliases `src/`.
- Data layer: typed `invoke` in `lib/tauri.ts`, TanStack Query keys in `lib/query-keys.ts`,
  refetch cadences in `lib/query-client.ts`.

## Mock seam (test-only)

The shipped app has **no mocks**: it always reads `~/.aws` profiles, hits real AWS via the
`(profile,region)` client pool, and connects a real ACP harness. The mock AWS clients
(`resources/<svc>/client.rs` `Mock*`), the fixture graph (`src-tauri/src/mock.rs`), and the
scripted agent (`agent/mock_session.rs`) are compiled **only** under the `mock` cargo feature —
the spec §13 offline test seam. Run the offline suite with `cargo test --features mock`. There
is no `MERCEK_MOCK` env switch anymore; the seam is a compile-time feature, not a runtime flag.

## Persistence: redb, not SQLite

The spec defaults to SQLite, but `libsqlite3-sys` (bundled) fails to compile on Rust 1.94
(unstable `cfg_select` in its build script). Per spec §12.2, `redb` is the sanctioned pure-Rust
swap — that's what `db/store.rs` uses (scope persistence; snapshot cache is next).

## Status (Phase 0 done; Phase 1 read in progress)

Phase 0 skeleton: design tokens, app shell, resource tree, editor tabs, command palette,
ts-rs pipeline, mock discovery. Phase 1 so far: full ECS domain model (81 ts-rs types covering
the `Describe*` surface), `~/.aws` profile parsing, AWS SDK client pool + STS identity, the
`EcsApi` mockable seam (`SdkEcs` real + `MockEcs`) with SDK→domain mappers, the bounded-fan-out
discovery orchestrator, and redb scope persistence. **Not yet:** dependent resources
(cloudwatch/logs/elb/autoscaling/ec2), snapshot cache, log-tail channel, progressive emit, and
the real-AWS path is compile-verified only (untested against a live account). See
`specs/mercek.md` §17.

## Conventions (from spec §14)

Comment _why_, not _what_. `thiserror` per module; `anyhow` only at the `commands/` boundary.
No `unwrap()`/`expect()` in non-test code. TS strict; no `any` at API boundaries (generated
types only).
