# Contributing to Mercek

Thanks for considering a contribution! Mercek is a local-first desktop IDE for
Amazon ECS, built with Tauri 2 (Rust backend) and React 19 + TypeScript (frontend).

## Prerequisites

- **Rust** (recent stable) and **pnpm**.
- The [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.
- An AWS account is **not** required to develop — the offline test suite runs against
  fixtures behind a compile-time `mock` feature.

## Setup

```bash
git clone git@github.com:utibeabasi6/mercek.git
cd mercek
pnpm install
pnpm tauri dev        # run the desktop app (Vite + Rust)
```

## Commands

```bash
pnpm tauri dev          # run the app
pnpm build              # frontend typecheck + bundle (tsc && vite build)
pnpm gen:types          # regenerate src/types/generated from Rust (ts-rs)
pnpm exec tsc --noEmit  # frontend typecheck only

cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml --features mock   # offline suite
```

## How the project is laid out

- **Backend** (`src-tauri/src/`) is layered, with dependencies pointing inward:
  `commands → discovery → resources → aws → domain`. `commands/` is a thin Tauri
  boundary with no business logic, and AWS SDK types never leak above `resources/`.
- **Frontend** (`src/`) is feature-sliced: `features/<feature>/{api,components}`, with
  shared primitives in `components/ui` and `components/layout`. `@/` aliases `src/`.
- **Marketing site** lives in `mercek-site/` (a separate Astro project).

## The type bridge (ts-rs)

Rust domain types derive `ts_rs::TS` and export to `src/types/generated/`. **Never
hand-edit `src/types/generated/`** — run `pnpm gen:types` (or `cargo test`) to
regenerate, and import types via `@/types`. CI fails if the committed generated types
drift from the Rust source.

## The mock seam

The shipped app has no mocks — it always reads `~/.aws` and hits real AWS. The mock AWS
clients, fixture graph, and scripted agent are compiled **only** under the `mock` cargo
feature. Run the full offline suite with `cargo test --features mock`.

## Code style

- **Rust:** no `unwrap()` / `expect()` in non-test code. `thiserror` per module;
  `anyhow` only at the `commands/` boundary. Comment _why_, not _what_.
- **TypeScript:** strict mode; no `any` at API boundaries — use the generated types.

## Pull requests

- One logical change per PR.
- Make sure the checklist in the PR template passes (typecheck, clippy, mock tests, and
  committed generated types).
- Update `CHANGELOG.md` if your change affects users.

## Security

Mercek talks to real AWS with the user's own credentials. Please treat anything that
could read, store, or transmit credentials/secrets, or that could mutate AWS resources
without explicit confirmation, as security-sensitive. See [SECURITY.md](./SECURITY.md)
for how to report vulnerabilities — **do not** open a public issue for them.

## Questions?

Open a [discussion](https://github.com/utibeabasi6/mercek/discussions).
