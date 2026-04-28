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
  "ddp": {
    "transport": "uws"
  }
}
```

The environment variable takes precedence over `settings.json` when both are set.

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

## Verifying which transport is active

On the server, you can inspect the configured transport via the Meteor shell:

```javascript
process.env.DDP_TRANSPORT || Meteor.settings?.ddp?.transport || "sockjs";
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

## Reverting to `sockjs`

Unset the environment variable or set it explicitly:

```bash
unset DDP_TRANSPORT
# or
DDP_TRANSPORT=sockjs meteor run
```

No code change is required — the transport is selected at server startup.
