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

::: warning
If you run more than one `DDP_TRANSPORT=uws` Meteor process on a single Linux host that shares one kernel network namespace, **each process must declare its own `uws.port` (or `uws.host`)**. The internal uws listen socket is bound exclusively, so only one process per `(host, port)` tuple can start.
:::

Unlike `sockjs` — which lives inside the same `http.Server` instance Meteor already binds for the public HTTP port — `uws` runs a second listening socket on its own internal port (default `127.0.0.1:5001`). WebSocket upgrades arriving on the public HTTP server are proxied into that internal socket via a local TCP connection. This architecture is what lets `uWebSockets.js` handle WebSocket I/O at native speed without giving up Meteor's Connect-style middleware on the public port.

One consequence of that architecture: every Meteor process running `uws` in the same kernel network namespace needs its own internal `(host, port)` tuple. The kernel demuxes incoming connections by destination address, so as long as the tuples are distinct, each process owns its own listen socket and traffic is routed unambiguously.

Deployments that share a kernel netns and therefore need per-process configuration:

- **Multi-tenant containers** under `network_mode: "host"` on Docker / Podman, each with its own database but co-located on one host.
- **Multi-process horizontal scaling** via PM2, systemd templated services, or `cluster`-style runners on a single VM.
- **Co-scheduled pods** when an orchestrator places two pods of one app on the same node.
- **Local development** with two Meteor projects running `DDP_TRANSPORT=uws` at the same time.

Single-process deployments and orchestrators that give each instance its own kernel netns (the default for Docker bridge networking, Kubernetes pods, etc.) need no extra configuration — the default `127.0.0.1:5001` is fine because only one process binds it.

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

A typical multi-process layout running several Meteor 3.5 containers on one Linux host with shared kernel netns (`network_mode: "host"`) declares two distinct values per service: the public `PORT` and an internal `uws.port` inside `METEOR_SETTINGS`. Both are independent and both must be unique across the netns:

```yaml
services:
  tenant1:
    image: my-meteor-app:latest
    network_mode: "host"
    environment:
      - PORT=3039                         # public HTTP port — unique per service
      - ROOT_URL=https://app1.example.com
      - DDP_TRANSPORT=uws
      # Internal uws proxy port — unique per service
      - METEOR_SETTINGS={"packages":{"ddp-server":{"uws":{"port":5001,"host":"127.0.0.1"}}}}
      - MONGO_URL=mongodb://…/tenant1

  tenant2:
    image: my-meteor-app:latest
    network_mode: "host"
    environment:
      - PORT=3040                         # different public port
      - ROOT_URL=https://app2.example.com
      - DDP_TRANSPORT=uws
      - METEOR_SETTINGS={"packages":{"ddp-server":{"uws":{"port":5002,"host":"127.0.0.1"}}}}
      - MONGO_URL=mongodb://…/tenant2

  # tenant3 -> uws.port 5003, tenant4 -> 5004, etc.
```

The reverse proxy (NGINX, Caddy, ALB, …) in front of Meteor does not need any change: it keeps talking to each service's public `PORT` exactly as it would for `sockjs`. The internal `uws.port` is never exposed outside the container.

#### Troubleshooting: `failed to listen on 127.0.0.1:5001 (address already in use)`

If two Meteor processes in the same kernel netns both try to bind the same internal uws `(host, port)` tuple — typically because both rely on the default `127.0.0.1:5001` — the second one to start refuses the bind and Meteor throws at startup:

```text
Error: uWebSockets.js: failed to listen on 127.0.0.1:5001 (address already in use).
  Another Meteor instance in this network namespace is already bound to this port.
  Set a distinct Meteor.settings.packages["ddp-server"].uws.port (or .host) for each instance.
    at packages/ddp-server/transports/uws.js:121:17
    at Object.setup (packages/ddp-server/transports/uws.js:119:14)
    at new StreamServer (packages/ddp-server/stream_server.js:45:27)
    …
```

To resolve, give the failing service its own internal uws port:

- **Recommended**: edit the service's `environment:` block in `docker-compose.yml` (or equivalent in your orchestrator) and add a `METEOR_SETTINGS={"packages":{"ddp-server":{"uws":{"port":<DISTINCT>,"host":"127.0.0.1"}}}}` line; pick a port no other process in the same netns uses, restart.
- **Alternative**: use `DDP_TRANSPORT=sockjs` on every service that shares the host netns. SockJS does not run a separate internal port and never collides — at the cost of lower DDP throughput.

Either path keeps every service running its own DDP stack with no cross-process traffic mixing.

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


## Reverting to `sockjs`

Unset the environment variable or set it explicitly:

```bash
unset DDP_TRANSPORT
# or
DDP_TRANSPORT=sockjs meteor run
```

No code change is required — the transport is selected at server startup.
