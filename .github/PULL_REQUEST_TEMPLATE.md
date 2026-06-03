<!-- Thanks for the PR! Keep it to one logical change. -->

## What

<!-- What does this PR do? -->

## Why

<!-- What problem does it solve? Link any related issue (e.g. Closes #123). -->

## Checklist

- [ ] Frontend typechecks and builds (`pnpm build`)
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` is clean
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --features mock` passes
- [ ] If Rust domain/error types changed: ran `pnpm gen:types` and committed `src/types/generated`
- [ ] `CHANGELOG.md` updated if this affects users
