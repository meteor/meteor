# Cluster

- `Who maintains the package` – [Bertrand Dupont](https://github.com/dupontbertrand)

[[toc]]

## What Is It?

A Meteor 3 compatible fork of [`meteorhacks:cluster`](https://github.com/meteorhacks/cluster), providing multi-core support, load balancing, and service discovery for Meteor apps.

The original package was abandoned around 2016. This fork ports it to Meteor 3 with async/await, modern dependencies, and updated MongoDB driver — while preserving the same public API.

::: warning
This is a **compatibility / migration bridge**, not a new recommended scaling architecture. If you only need multi-core CPU utilization, an external process manager like [PM2](https://pm2.keymetrics.io/) is simpler. This package is for apps that relied on `meteorhacks:cluster` features like service discovery, DDP-aware proxying, or `Cluster.discoverConnection()`.
:::

## How to Download It?

```bash
meteor add dupontbertrand:cluster
```

## How to Use It?

### Multi-Core (Simplest Use Case)

Just set the `CLUSTER_WORKERS_COUNT` environment variable:

```bash
# Use all available CPU cores
CLUSTER_WORKERS_COUNT=auto meteor run

# Or specify a number
CLUSTER_WORKERS_COUNT=4 meteor run
```

The package forks child processes automatically. No code changes needed.

### Service Discovery + Load Balancing

For multi-instance deployments with automatic service registration and DDP-aware load balancing:

```bash
export CLUSTER_DISCOVERY_URL="mongodb://your-mongo-host/cluster"
export CLUSTER_SERVICE="web"
export CLUSTER_WORKERS_COUNT=2
```

Instances register themselves in MongoDB and discover each other automatically. No need to reconfigure a load balancer when adding or removing instances.

### Microservices

Connect to other services in the cluster by name:

```js
// Server
const serviceConnection = Cluster.discoverConnection('payments');

// Call methods on the remote service
const result = await serviceConnection.callAsync('processPayment', data);
```

## API

### `Cluster.connect(discoveryUrl, [options])`

Connect to a discovery backend (currently MongoDB).

```js
Cluster.connect('mongodb://host/db');
```

Usually configured via the `CLUSTER_DISCOVERY_URL` environment variable instead of calling directly.

### `Cluster.register(serviceName, [options])`

Register this instance as a named service.

```js
Cluster.register('web');
```

Options:
- `endpoint` — the URL other instances use to reach this one (defaults to `ROOT_URL`)
- `balancer` — URL of the balancer (defaults to `CLUSTER_BALANCER_URL`)
- `uiService` — the service that serves the UI (defaults to the registered service name)

Usually configured via the `CLUSTER_SERVICE` environment variable.

### `Cluster.discoverConnection(serviceName, [ddpOptions])`

Get a DDP connection to a named service. The connection automatically tracks healthy instances via the discovery backend.

```js
const conn = Cluster.discoverConnection('analytics');
const data = await conn.callAsync('getReport', params);
```

### `Cluster.allowPublicAccess(serviceList)`

Allow public (non-authenticated) access to specific services.

```js
Cluster.allowPublicAccess(['web', 'api']);
```

Usually configured via the `CLUSTER_PUBLIC_SERVICES` environment variable (comma-separated).

## Environment Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `CLUSTER_WORKERS_COUNT` | Number of worker processes (`auto` = all cores) | 1 (no clustering) |
| `CLUSTER_DISCOVERY_URL` | MongoDB URL for service discovery | — |
| `CLUSTER_SERVICE` | Name to register this instance as | — |
| `CLUSTER_ENDPOINT_URL` | URL for other instances to reach this one | `ROOT_URL` |
| `CLUSTER_BALANCER_URL` | URL of the load balancer | — |
| `CLUSTER_PUBLIC_SERVICES` | Comma-separated list of public services | — |
| `CLUSTER_UI_SERVICE` | Service that serves the UI | same as `CLUSTER_SERVICE` |

## What Changed From meteorhacks:cluster

This fork preserves the original API. Under the hood:

- MongoDB discovery backend rewritten in **async/await** (was Fibers/wrapAsync)
- MongoDB driver updated from 1.4.x to **6.12.0**
- `underscore` replaced with native ES2015+
- npm dependencies updated (`cookies`, `http-proxy`, `portscanner`)
- Fixed `Buffer()` deprecation and a pre-existing IPC listener bug
- Balancer made transport-aware for compatibility with pluggable transports ([#14231](https://github.com/meteor/meteor/pull/14231))
- Test suite adapted for Meteor 3

Full changelog: [METEOR3-PORT.md](https://github.com/dupontbertrand/cluster/blob/master/METEOR3-PORT.md)

## Known Limitations

- The balancer uses `OverShadowServerEvent` to intercept HTTP/WS traffic at the `httpServer` level. This is invasive and could break if Meteor changes its listener initialization order.
- No Windows testing yet.
- The worker pool uses `child_process.fork` with per-worker ports (not `node:cluster`).

## Compatibility

- Meteor 3.4+
- Node 22
- Tested on Linux

## Sources

- **Atmosphere:** [dupontbertrand:cluster](https://atmospherejs.com/dupontbertrand/cluster)
- **GitHub:** [dupontbertrand/cluster](https://github.com/dupontbertrand/cluster)
- **Original package:** [meteorhacks/cluster](https://github.com/meteorhacks/cluster)
- **Forum Discussion:** [Memory usage and sessions quadruple after upgrading to Meteor 3](https://forums.meteor.com/t/memory-usage-and-sessions-quadruple-after-upgrading-to-meteor-3/64496)
