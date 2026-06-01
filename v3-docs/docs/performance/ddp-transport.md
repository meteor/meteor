# DDP Transport

Meteor 3.5+ ships a pluggable DDP transport layer. The transport is the WebSocket implementation that carries DDP messages between client and server — DDP itself (subscriptions, methods, RPCs) is unchanged. You can switch the underlying transport without touching application code.

::: warning
The default transport (`sockjs`) is the right choice for most apps. Switch to `uws` only if you have measured a real bottleneck in WebSocket framing or polling fallback, and you control the deployment environment well enough to verify WebSocket connectivity end-to-end.
:::

## Available transports

| Transport | What it is | Use when |
|-----------|-----------|---------|
| `sockjs` (default) | SockJS with HTTP polling fallback | You need maximum compatibility — clients behind strict proxies, mobile networks that drop WebSocket, or environments without WebSocket support |
| `uws` | [µWebSockets.js](https://github.com/uNetworking/uWebSockets.js/) — raw WebSocket, no polling fallback | You control the network path, all clients can hold a raw WebSocket, and you want lower latency and higher message throughput |

## Choosing a transport

### When `sockjs` is the right choice

- Public-facing apps where some users sit behind corporate proxies, captive portals, or networks that block WebSocket.
- Mobile-heavy traffic where intermittent WebSocket failures need to fall back to long polling.
- Deployments without a WebSocket-aware load balancer in front of Meteor.

### When `uws` pays off

- You have measured high CPU on the server attributable to SockJS framing or to the JavaScript SockJS implementation.
- You see meaningful latency from the SockJS handshake on hot reconnects (mobile, dashboards).
- You can guarantee WebSocket connectivity for every client (e.g. internal apps, controlled deployments, or apps where you accept that proxy-blocked clients will simply not connect).
- Your load balancer (NGINX, HAProxy, AWS ALB, Galaxy) upgrades HTTP to WebSocket reliably.

## Configuring the transport

### Via environment variable

```bash
DDP_TRANSPORT=uws meteor run

# explicit default
DDP_TRANSPORT=sockjs meteor run
```

### Via `settings.json`

```json
{
  "packages": {
    "ddp-server": {
      "transport": "uws"
    }
  }
}
```

This populates `Meteor.settings.packages["ddp-server"].transport` on the server, which is what the DDP server reads. The environment variable takes precedence over `settings.json` when both are set.

### Legacy `DISABLE_SOCKJS`

`DISABLE_SOCKJS=1` is honored as an alias for `DDP_TRANSPORT=uws` for backward compatibility, but it is deprecated. Prefer `DDP_TRANSPORT` for new deployments because it leaves room for additional transport backends and is easier to read in deployment configs.

See the full [`DDP_TRANSPORT`](/cli/environment-variables#ddp-transport) and [`DISABLE_SOCKJS`](/cli/environment-variables#disable-sockjs) reference for details.

## Operational considerations

### Load balancers

`uws` does not use HTTP polling. If your load balancer is configured for SockJS-style sticky polling rather than WebSocket pass-through, switch the configuration to:

- Upgrade HTTP to WebSocket on the DDP path (typically `/sockjs` or your custom DDP URL).
- Disable session affinity that depends on cookie-based stickiness, since there are no HTTP requests to attach cookies to once the WebSocket is established.
- Ensure idle WebSocket timeouts are at least as long as your DDP heartbeat interval (default: 35 seconds).

### Combining with WebSocket compression

The `SERVER_WEBSOCKET_COMPRESSION` setting still applies to both transports. If you saw compression overhead with SockJS, the same trade-off applies under `uws` — just at a lower baseline cost. See [WebSocket Compression](/performance/websocket-compression).

### Combining with session resumption

The DDP [session resumption](/api/meteor#reconnection) feature added in 3.5 is transport-agnostic. Both `sockjs` and `uws` benefit from sessions surviving brief network blips.

### Multi-process and multi-tenant deployments {#multitenancy}

::: danger
If you run more than one `DDP_TRANSPORT=uws` Meteor process on a single Linux host that shares one kernel network namespace, **you must give every process its own `uws.port` (or `uws.host`)**. Forgetting to do so will fail loudly at startup since Meteor 3.5; in pre-3.5 versions it failed silently and split WebSocket traffic between unrelated processes.
:::

Unlike `sockjs` — which lives inside the same `http.Server` instance Meteor already binds — `uws` runs a second listening socket on its own internal port (default `127.0.0.1:5001`). WebSocket upgrades to the main HTTP server are proxied into that internal socket via a local TCP connection. This is what lets `uWebSockets.js` work without giving up Meteor's Connect-style middleware on the public port.

The proxy step is the operational gotcha. Two Meteor processes in the same kernel network namespace would both default to `127.0.0.1:5001` for their internal uws server. The Linux kernel allows that under `SO_REUSEPORT` and load-balances inbound connections across the two listening sockets at random, so a WebSocket upgrade that arrived on process A's public port can be handed by the kernel to process B's internal listener — and from there process B parses the DDP method, executes it against its own MongoDB connection, and writes to its own database.

Real-world deployments that share a kernel netns:

- **Multi-tenant containers** under `network_mode: "host"` on Docker / Podman, each with its own database but co-located on one host.
- **Multi-process horizontal scaling** via PM2, systemd templated services, or `cluster`-style runners on a single VM.
- **Galaxy / Meteor Cloud co-scheduled pods** when an orchestrator places two pods of one app on the same node.
- **Local development** with two Meteor projects running `DDP_TRANSPORT=uws` at the same time. The second project silently joins the first project's `SO_REUSEPORT` pool on `127.0.0.1:5001` and DDP traffic mixes between them with no warning.

#### Configure a distinct uws port per process

Give each process its own internal `uws.port` via `METEOR_SETTINGS`:

```bash
# Process 1
METEOR_SETTINGS='{"packages":{"ddp-server":{"uws":{"port":5001,"host":"127.0.0.1"}}}}' \
  PORT=8081 DDP_TRANSPORT=uws meteor run

# Process 2 — on the SAME host, in the SAME netns
METEOR_SETTINGS='{"packages":{"ddp-server":{"uws":{"port":5002,"host":"127.0.0.1"}}}}' \
  PORT=8082 DDP_TRANSPORT=uws meteor run
```

…or equivalently via `settings.json`:

```json
{
  "packages": {
    "ddp-server": {
      "uws": {
        "port": 5001,
        "host": "127.0.0.1"
      }
    }
  }
}
```

The full set of settings:

| Field | Default | Meaning |
|-------|---------|---------|
| `port` | `5001` | TCP port of the internal uws listen socket |
| `host` | `"127.0.0.1"` | Address the internal uws server binds to |
| `payloadLength` | `48` | Max WebSocket payload, in KiB |
| `timeout` | `45` | Idle timeout, in seconds |

If you cannot avoid running on the same port, use distinct loopback hosts (`127.0.0.2`, `127.0.0.3`, …) — Linux routes all of `127.0.0.0/8` to `lo` by default, so each process binds a distinct `(host, port)` tuple and the kernel demuxes correctly.

#### Example: multi-tenant `docker-compose.yml`

A typical multi-tenant setup running several Wekan / Meteor 3.5 containers on one Linux host with shared kernel netns (`network_mode: "host"`) needs **two** things in every service's `environment`: the `DDP_TRANSPORT=uws` opt-in, **and** a `METEOR_SETTINGS` block with that service's own `uws.port`. The `PORT` env var (public HTTP port) and the `uws.port` (internal proxy port) are independent — both must be distinct per service:

```yaml
services:
  customer1:
    image: ghcr.io/wekan/wekan:v9.31     # or any Meteor 3.5+ image
    network_mode: "host"
    environment:
      - PORT=3039                         # public HTTP port — distinct per service
      - ROOT_URL=https://kanban1.example.com
      - DDP_TRANSPORT=uws
      - METEOR_REACTIVITY_ORDER=changeStreams,oplog,polling
      # Internal uws proxy port — distinct per service
      - METEOR_SETTINGS={"packages":{"ddp-server":{"uws":{"port":5001,"host":"127.0.0.1"}}}}
      - MONGO_URL=mongodb://…/customer1
      # … rest of the customer1 config

  customer2:
    image: ghcr.io/wekan/wekan:v9.31
    network_mode: "host"
    environment:
      - PORT=3040                         # different public port
      - ROOT_URL=https://kanban2.example.com
      - DDP_TRANSPORT=uws
      - METEOR_REACTIVITY_ORDER=changeStreams,oplog,polling
      # Different internal uws port too
      - METEOR_SETTINGS={"packages":{"ddp-server":{"uws":{"port":5002,"host":"127.0.0.1"}}}}
      - MONGO_URL=mongodb://…/customer2
      # … rest of the customer2 config

  # customer3 -> uws.port 5003, customer4 -> 5004, etc.
```

If you have a reverse proxy (NGINX, Caddy, …) in front, it does not need any change: it keeps talking to each service's public `PORT` exactly as before. The `uws.port` is purely internal — never exposed outside the container/process.

#### Troubleshooting: `failed to listen on 127.0.0.1:5001 (address already in use)`

Since Meteor 3.5, the internal listen socket is opened with `LIBUS_LISTEN_EXCLUSIVE_PORT`, so the second process trying to bind the default port fails fast at startup:

```text
Error: uWebSockets.js: failed to listen on 127.0.0.1:5001 (address already in use).
  Another Meteor instance in this network namespace is already bound to this port.
  Set a distinct Meteor.settings.packages["ddp-server"].uws.port (or .host) for each instance.
    at packages/ddp-server/transports/uws.js:121:17
    at Object.setup (packages/ddp-server/transports/uws.js:119:14)
    at new StreamServer (packages/ddp-server/stream_server.js:45:27)
    …
```

If you see this on first boot after upgrading from an earlier 3.5 beta — especially if you operate a multi-tenant Wekan or any multi-process Meteor deployment — it is **not a regression**. It is the fail-fast behaviour replacing the silent SO_REUSEPORT mix-routing that pre-3.5-beta.12 versions exhibited. The fix surfaces a latent misconfiguration that used to corrupt data without warning.

To resolve, give the failing service its own internal uws port:

- **Quick**: edit the service's `environment:` block in `docker-compose.yml` (or equivalent in your orchestrator) and add a `METEOR_SETTINGS={"packages":{"ddp-server":{"uws":{"port":<DISTINCT>,"host":"127.0.0.1"}}}}` line, pick a port no other service in the same netns uses, restart.
- **Alternative** (if you cannot configure per-service settings right now): set `DDP_TRANSPORT=sockjs` and `METEOR_REACTIVITY_ORDER=oplog,polling` on every service. SockJS does not run a separate internal port and does not collide. Trade-off: lower DDP throughput.

In Meteor 3.5-beta releases prior to this fix the same misconfiguration would silently succeed via `SO_REUSEPORT`, with inbound WebSocket frames mix-routed between the two processes. If you upgraded from an earlier beta and have not yet seen this error, audit with the verification step below before assuming your previous deployment was correct.

#### Verifying the internal listen sockets

From the host (or from inside any container sharing the netns):

```bash
cat /proc/net/tcp | awk '$4 == "0A" {print $2}' | sort | uniq -c
```

Each port has its own line; the second column is `LOCAL_ADDR:PORT` in little-endian hex. `0x1389` is port 5001, `0x138A` is 5002. You want to see at most one listener per port:

```text
1 0100007F:1389    # 127.0.0.1:5001 — one Meteor process
1 0100007F:138A    # 127.0.0.1:5002 — the other Meteor process
```

If you see `2 0100007F:1389`, two processes are sharing the default uws port via SO_REUSEPORT and inbound DDP traffic is being mixed between them. Reconfigure each to bind its own port.

#### Reverse-proxy implications

The internal uws port is purely local — it is never exposed to clients. The reverse proxy in front of Meteor (NGINX, Caddy, ALB, Galaxy…) talks to each process's *public* port (`PORT` env var) exactly as it would for `sockjs`. The per-process uws port configuration only matters between the public port and the internal uws server inside the same process.

For an end-to-end walkthrough — reproduction recipe, the two interacting latent bugs the fix addresses ([PR #14425](https://github.com/meteor/meteor/pull/14425)), and validation against a real Wekan multi-tenant image — see the [Wekan reproduction guide](https://github.com/italojs/wekan/blob/repro/uws-changestreams-multitenancy/tests/multitenancy-repro/README.md) on the bug's original reporter's fork, kept as the historical record of how the bug was reproduced and how the fix was empirically validated.

## Verifying which transport is active

On the server, you can inspect the configured transport via the Meteor shell:

```javascript
process.env.DDP_TRANSPORT
  || Meteor.settings?.packages?.["ddp-server"]?.transport
  || "sockjs";
```

On the client, opening the browser Network tab and filtering by WS will show:

- `sockjs` — requests to `/sockjs/...` with handshake URLs like `/sockjs/info`.
- `uws` — a single WebSocket request to the DDP endpoint with no SockJS framing.

## Migration checklist

If you are switching an existing app from `sockjs` to `uws`:

- [ ] Confirm load balancer / reverse proxy upgrades WebSocket (no polling fallback exists).
- [ ] Confirm WebSocket idle timeouts ≥ Meteor heartbeat interval.
- [ ] Test on networks representative of your users (mobile, public Wi-Fi, corporate).
- [ ] Roll out to a subset of traffic first if your load balancer supports it.
- [ ] Keep `sockjs` available as a rollback (toggle the env var, redeploy).
- [ ] If multiple Meteor processes will share a host (multi-tenant, multi-process scaling, Galaxy co-scheduling, etc.), set a distinct `Meteor.settings.packages["ddp-server"].uws.port` for each. See [Multi-process and multi-tenant deployments](#multitenancy).

### Upgrading from earlier 3.5 betas (3.5-beta.10 / .11)

If you ran `DDP_TRANSPORT=uws` on a multi-process host with an earlier 3.5 beta, your deployment was working **but** silently mix-routing inbound WebSocket frames between processes via `SO_REUSEPORT`. The first container to bind `127.0.0.1:5001` "won", and inbound DDP traffic from every public port was distributed by the kernel across every process. This was the cross-tenant data leakage documented in [PR #14425](https://github.com/meteor/meteor/pull/14425).

After upgrading to 3.5-beta.12 or later, the same misconfiguration **throws at startup** instead of silently corrupting data:

```text
Error: uWebSockets.js: failed to listen on 127.0.0.1:5001 (address already in use).
  Another Meteor instance in this network namespace is already bound to this port.
  …
```

This is the **intended fix**, not a regression. To bring your deployment back up:

1. **Recommended**: add a distinct `Meteor.settings.packages["ddp-server"].uws.port` per service (see [Multi-process and multi-tenant deployments](#multitenancy) for the docker-compose example). All your services keep using `uws` with the per-tenant configuration; no SockJS perf trade-off.
2. **Quick rollback**: set `DDP_TRANSPORT=sockjs` and `METEOR_REACTIVITY_ORDER=oplog,polling` on every service. Single env-var change per service, no per-service uniqueness needed.

Both paths are valid. Option 1 keeps the uws performance improvements and works correctly. Option 2 is the same workaround used in earlier wekan releases via [wekan commit 7b88f4c21](https://github.com/wekan/wekan/commit/7b88f4c21a05810966e49833b393f4bd02d70d47).

## Reverting to `sockjs`

Unset the environment variable or set it explicitly:

```bash
unset DDP_TRANSPORT
# or
DDP_TRANSPORT=sockjs meteor run
```

No code change is required — the transport is selected at server startup.
