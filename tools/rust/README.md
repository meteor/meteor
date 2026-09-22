# Meteor Rust workspace

This workspace contains native helpers that move bounded, performance-critical
work outside the Meteor tool's Node.js process. Add another crate only when
profiling shows that a native boundary is justified.

The checked-in toolchain and lockfile are authoritative for local development
and dev-bundle builds. Compiled helpers are installed in `dev_bundle/bin`; Rust
and Cargo are build-time dependencies and are not shipped in the bundle.

## Commands

Run these commands from this directory:

```bash
rustup component add clippy rustfmt
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo build --release --locked --workspace
```

## Crates

- `source-map-helper`: file-backed source-map composition for large Rspack
  builds.
