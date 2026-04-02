# Spike: Bun-Only Host

**Branch:** `spike/bun-only-host` (child of `spike/esm-bundle-format`)
**Goal:** Explore what a credible Bun-native host/runtime path looks like on top of the ESM bundle format.
**Started:** 2026-04-01

---

## Design Principles

This is NOT a translation of Meteor-Node into Meteor-Bun. This spike follows these rules:

### 1. Preserve Meteor semantics, not Node-era implementation details

**Preserve:** DDP, methods, publications, accounts, startup hooks, `Meteor.startup()`, `WebApp.connectHandlers`, the app developer's mental model.

**Do not preserve by default:** Express, `http.createServer`, SockJS, `vm.runInThisContext`, Connect-style middleware plumbing, Node-style socket timeouts.

### 2. Let Bun be Bun

If Bun has a better native model (fetch handler, native WebSocket, `Bun.file()`, `Bun.serve()`), prefer that model rather than forcing Bun through Node-shaped abstractions.

### 3. Compatibility bridges are temporary

Phase 1 uses compat seams (Unix socket proxy, `WebApp.startListening` patch, `BunSocket` adapter). Each seam is explicitly **transitional** — a way to validate the concept, not the target architecture.

### 4. Simplify when the Bun-native path becomes clear

Don't stack compat layers "just in case". When a cleaner native path emerges, replace the bridge instead of keeping it.

---

## What exists already (from the ESM spike)

- `start-bun.mjs` — boots Meteor on Bun with a **proxy architecture** (stopgap):
  - Meteor/webapp listens on PORT (`http.createServer`, internal)
  - `Bun.serve()` listens on PORT+1 (public-facing)
  - HTTP → proxied to webapp
  - WebSocket → bridged to StreamServer via EventEmitter shim

This works. 13/13 consolidation tests pass. But it's two ports, double HTTP handling, and a fragile shim.

---

## Architecture

### Phase 1 — Compat bridges (current target)

```
Bun.serve(:PORT)
  ├── HTTP → fetch() over Unix socket → Express (webapp httpServer)
  └── WS  → BunSocket adapter → StreamServer
```

Single port to the user. Express runs unmodified under Bun's Node compat on an internal Unix socket. WebSocket bypasses SockJS entirely.

**⚠️ Temporary seams:** Unix socket proxy, `WebApp.startListening` patch, `BunSocket` class, direct access to `streamServer.open_sockets`.

### Target — Bun-native (future, driven by benchmark results)

```
Bun.serve(:PORT)
  ├── HTTP → fetch handler (Bun.file for static, toHTMLAsync for boilerplate)
  └── WS  → Bun-native DDP transport (PR #14231 interface)
```

No Express, no http.createServer, no SockJS, no proxy.

---

## Scope — strict

### In scope

1. **Single-port Bun.serve() host** — HTTP + WebSocket on one port
2. **DDP over Bun native WebSocket** — methods, publications, accounts
3. **All 3 templates** — `--minimal`, `--blaze`, `--full` functional
4. **Benchmarks** — HTTP req/sec, WS msg/sec, cold start, RSS vs Node

### Out of scope

- Linker changes (CJS → real ESM packages)
- Client store (Minimongo → TinyBase)
- Observe driver (oplog → change streams)
- Accounts rework
- Any change to `meteor run` / CLI / isobuild

---

## TODO

- [ ] Refactor esm-loader.mjs: separate `bootPackages()` / `runMain()`
- [ ] Create BunSocket adapter class (⚠️ transitional)
- [ ] Create bun-host.mjs: HTTP-only via Unix socket proxy
- [ ] Validate HTTP proxy (headers, compression, caching)
- [ ] Add WebSocket/DDP handler to bun-host.mjs
- [ ] Test `--minimal` template end-to-end
- [ ] Test `--blaze` template end-to-end
- [ ] Test `--full` template end-to-end
- [ ] Benchmark: Node legacy vs Node ESM vs Bun ESM
- [ ] Document findings: what's easy, what's hard, what blocks

---

## Key files

| File | Role | Status |
|---|---|---|
| `spike/esm-loader.mjs` | ESM boot sequence (to refactor) | Exists |
| `spike/start-bun.mjs` | Proof-of-concept proxy launcher | Exists (stopgap) |
| `bun-only/bun-host.mjs` | Single-port Bun.serve() host | To create |
| `bun-only/bun-ddp-transport.mjs` | BunSocket adapter class | To create |
| `bun-only/bench/` | Benchmark scripts + results | To create |

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-04-01 | Separate branch from ESM spike | Keep generic ESM work (valuable for Node too) clean from Bun-specific experiments |
| 2026-04-01 | Phase 1 uses Unix socket proxy for HTTP | Get functional quickly without rewriting 1500 lines of Express/webapp; let benchmarks decide if Phase 2 (pure fetch) is worth it |
| 2026-04-01 | Design principles: preserve semantics, not implementation | Avoid the trap of "Meteor-Node on Bun" — build a Bun-native path instead |
