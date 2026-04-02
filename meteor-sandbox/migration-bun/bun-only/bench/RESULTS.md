# Benchmark Results — Bun-Only Host vs Node

**Date:** 2026-04-01
**App:** `meteor create --full` (Blaze, Mongo, FlowRouter, Rspack)
**Machine:** ThinkPad P52, Linux 6.8.0-106-generic, x86_64
**Node:** v22.22.0 | **Bun:** 1.2.4
**MongoDB:** 7.0.14 (localhost)
**Tool:** Apache Bench (`ab`), custom WebSocket scripts

---

## 1. HTTP Throughput

### 1a. Initial benchmarks (Bun with Unix socket proxy only)

All HTTP routed through `fetch({ unix: SOCK_PATH })` → Express.

| Route | Node legacy | Node ESM | Bun (proxy) | Bun vs Node legacy |
|---|---|---|---|---|
| **Boilerplate `/`** (req/sec) | 884 | 1,061 | 1,163 | +31% |
| **Static JS ~800KB** (req/sec) | 732 | 853 | 225 ¹ | -69% |
| **Static CSS ~1KB** (req/sec) | 1,556 | 1,991 | 3,579 | +130% |

Boilerplate latency: Node legacy 11.3 ms, Node ESM 9.4 ms, Bun proxy 8.6 ms.

¹ 1,810/2,000 `ab` "failed requests" — Content-Length variance from gzip re-encoding through proxy. Not actual failures.

### 1b. After Bun.file() for static assets

Static files served via `Bun.file()` (zero-copy sendfile), bypassing proxy.

| Route | Node legacy | Node ESM | Bun proxy | Bun + Bun.file() | Δ vs Node legacy |
|---|---|---|---|---|---|
| **Static JS ~800KB** (req/sec) | 732 | 853 | 225 | **3,419** | **+367%** |
| **Static CSS ~1KB** (req/sec) | 1,556 | 1,991 | 3,579 | **17,304** | **+1012%** |
| Failed requests | 0 | 0 | 1,810 | **0** | fixed |

### 1c. After direct boilerplate serving

Boilerplate served via `WebAppInternals.getBoilerplate()` → `new Response()`, bypassing proxy.

| Route | Node legacy | Node ESM | Bun proxy | Bun direct | Δ vs Node legacy |
|---|---|---|---|---|---|
| **Boilerplate `/`** (req/sec) | 884 | 1,061 | 1,203 | **2,146** | **+143%** |

### 1d. Final HTTP summary

| Route | Node legacy | Bun final | Δ | Bun final vs Node ESM |
|---|---|---|---|---|
| Boilerplate `/` | 884 | **2,146** | **+143%** | +102% |
| Static JS ~800KB | 732 | **3,419** | **+367%** | +301% |
| Static CSS ~1KB | 1,556 | **17,304** | **+1012%** | +769% |

---

## 2. DDP / WebSocket

### 2a. Sequential method roundtrip (500 calls, 1 connection)

| Percentile | Node legacy | Node ESM | Bun ESM |
|---|---|---|---|
| Mean | 0.49 ms | 0.45 ms | **0.13 ms** |
| P50 | 0.45 ms | 0.42 ms | **0.11 ms** |
| P95 | 0.82 ms | 0.79 ms | **0.19 ms** |
| P99 | 1.09 ms | 1.09 ms | **0.31 ms** |
| **Throughput** | 2,062/sec | 2,199/sec | **7,735/sec** |

Bun: **3.75x throughput**, **3.8x lower latency** vs Node legacy.

### 2b. Parallel burst — mono vs multi-connection diagnostic

200 total calls, varying connection count.

| Pattern | Node legacy | Node ESM | Bun ESM | Bun vs Node ESM |
|---|---|---|---|---|
| 1 conn × 200 calls | 2,786/sec | 3,806/sec | 87/sec | -98% |
| 10 conn × 20 calls | 3,889/sec | 5,184/sec | 729/sec | -86% |
| 50 conn × 4 calls | 4,797/sec | 4,710/sec | **7,198/sec** | **+53%** |

**Root cause:** Bun schedules WebSocket messages per-socket sequentially with a yield between each. Not the bridge, not EventEmitter, not DDP processing. Confirmed by:
- Raw Bun WS echo: 24K msg/sec mono-connection (no DDP overhead)
- Server-side instrumentation: ~0.05 ms/msg processing time (identical across patterns)
- 2,720 ms of 2,730 ms total is spent waiting between `ws.send()` and next `message()` callback

### 2c. Raw Bun WebSocket (no Meteor, no bridge)

Echo server, Bun.serve() only.

| Pattern | Throughput |
|---|---|
| 1 conn × 200 msgs | 23,953 msg/sec |
| 10 conn × 20 msgs | 34,725 msg/sec |
| 50 conn × 4 msgs | 28,887 msg/sec |

Uniformly fast. Confirms Bun's WS is not the bottleneck.

### 2d. Server-side timing instrumentation

Per-message processing time inside bun-host.mjs.

| Pattern | emit('data') avg | send() avg | Total server/msg |
|---|---|---|---|
| 1 conn × 200 calls | 0.033 ms | 0.039 ms | ~0.07 ms |
| 50 conn × 4 calls | 0.043 ms | 0.006 ms | ~0.05 ms |

### 2e. Realistic workload (subscribe + method calls + ping)

Sequential per client, parallel across clients. Mixed ops: 60% method, 25% subscribe, 15% ping. Random 10-100ms delay between ops.

| Scenario | Clients × Ops | Node legacy | Node ESM | Bun ESM | Bun vs legacy | Bun vs ESM |
|---|---|---|---|---|---|---|
| **Small team** | 10 × 20 | 3,180/sec | 3,683/sec | **6,285/sec** | +98% | +71% |
| **Typical SaaS** | 50 × 10 | 3,843/sec | 4,092/sec | **14,832/sec** | +286% | +262% |
| **Busy dashboard** | 100 × 5 | 4,754/sec | 4,926/sec | **12,893/sec** | +171% | +162% |
| **Traffic spike** | 200 × 2 | 9,420/sec | 10,881/sec | **23,714/sec** | +152% | +118% |

Per-op latency:

| Scenario | Node legacy | Node ESM | Bun ESM |
|---|---|---|---|
| Small team | 3.07 ms | 2.65 ms | **1.44 ms** |
| Typical SaaS | 12.30 ms | 11.57 ms | **2.91 ms** |
| Busy dashboard | 18.98 ms | 18.18 ms | **6.02 ms** |
| Traffic spike | 14.79 ms | 11.25 ms | **4.60 ms** |

Connection time (200 clients): Node legacy 418 ms, Node ESM 417 ms, Bun **206 ms** (2x faster).

---

## 3. Memory

| Metric | Node legacy | Node ESM | Bun ESM |
|---|---|---|---|
| RSS at rest | 305 MB | 257 MB | **191 MB** |
| RSS after 5-min soak | — | — | **179 MB** |

Bun: **-37%** vs Node legacy, **-26%** vs Node ESM.
Node ESM: -16% vs Node legacy (vm/Reify/Module patching overhead removed).

---

## 4. Cold Start

Time to first HTTP 200. 5 runs each.

| | Node legacy | Node ESM | Bun ESM |
|---|---|---|---|
| Run 1 (cold) | 1,005 ms | 788 ms | **691 ms** |
| Runs 2-5 avg | ~10 ms | ~11 ms | ~34 ms |

Run 1 is the meaningful cold start. Runs 2-5 show warm filesystem cache effect.
Bun: **-31%** cold start vs Node legacy.

---

## 5. Stability Soak Test

Bun ESM, `meteor create --full`, 20 clients, 5 minutes continuous.
Op mix: 60% method call, 25% subscribe, 15% ping. 10-100ms random delay per op.

| Metric | Value |
|---|---|
| Duration | 300.1 s |
| Clients | 20/20 (all connected throughout) |
| Total ops | 108,922 |
| Throughput | 362-364 ops/sec (constant start to finish) |
| Errors | **0** (0.00%) |
| Reconnects | 0 |
| HTTP health checks | 20/20 OK |
| RSS at start | 191 MB |
| RSS at end | 179 MB |
| Active clients at end | 20/20 |
| **Result** | **PASS** |

Throughput per 15-second interval (all 20 reports):

```
 15s: 364/sec  |  30s: 362/sec  |  45s: 362/sec  |  60s: 362/sec
 75s: 364/sec  |  90s: 364/sec  | 105s: 364/sec  | 120s: 364/sec
135s: 364/sec  | 150s: 364/sec  | 165s: 363/sec  | 180s: 363/sec
195s: 363/sec  | 210s: 364/sec  | 225s: 364/sec  | 240s: 364/sec
255s: 363/sec  | 270s: 363/sec  | 285s: 363/sec  | 300s: 363/sec
```

Zero drift over 5 minutes. No memory growth. No connection loss.

---

## 6. Node ESM vs Node Legacy (bonus observation)

The ESM bundle format improves Node itself, independent of Bun.

| Metric | Node legacy | Node ESM | Gain |
|---|---|---|---|
| HTTP boilerplate | 884/sec | 1,061/sec | +20% |
| HTTP static JS | 732/sec | 853/sec | +17% |
| HTTP static CSS | 1,556/sec | 1,991/sec | +28% |
| DDP sequential | 2,062/sec | 2,199/sec | +7% |
| RSS memory | 305 MB | 257 MB | -16% |
| Cold start | 1,005 ms | 788 ms | -22% |

Removing vm.runInThisContext, Reify, and Module.prototype patching has measurable cost.

---

## 7. Optimization progression

How each optimization step improved Bun's HTTP throughput:

| Step | Boilerplate | Static JS | Static CSS |
|---|---|---|---|
| **Bun + proxy only** | 1,163/sec | 225/sec | 3,579/sec |
| **+ Bun.file() static** | 1,203/sec | 3,419/sec (+1419%) | 17,304/sec (+383%) |
| **+ direct boilerplate** | 2,146/sec (+78%) | 3,419/sec | 17,304/sec |
| **vs Node legacy** | **+143%** | **+367%** | **+1012%** |

---

## How to reproduce

```bash
# Prereqs: Bun 1.2+, Node 22+, MongoDB 7+

# Build both formats
cd /tmp && mkdir bun-host-test && cd bun-host-test
/home/ber/Tech/meteor/meteor create --full test-full
cd test-full
/home/ber/Tech/meteor/meteor build --format=esm --directory /tmp/bun-host-test/full-build
/home/ber/Tech/meteor/meteor build --directory /tmp/bun-host-test/full-legacy

# Install deps
cd /tmp/bun-host-test/full-build/bundle/programs/server && npm install --production
cd /tmp/bun-host-test/full-legacy/bundle/programs/server && npm install --production

# Copy refactored esm-loader into ESM bundle
chmod u+w /tmp/bun-host-test/full-build/bundle/programs/server/esm-loader.mjs
cp /home/ber/Tech/meteor/meteor-sandbox/migration-bun/spike/esm-loader.mjs \
   /tmp/bun-host-test/full-build/bundle/programs/server/

# Start MongoDB
mongod --dbpath /tmp/mongod-data --port 27017 --fork --logpath /tmp/mongod.log

# --- Run benchmarks ---

# Node legacy
cd /tmp/bun-host-test/full-legacy/bundle
PORT=5001 MONGO_URL=mongodb://localhost:27017/bench ROOT_URL=http://localhost:5001 \
  node main.js &
bash bench.sh "Node-legacy" 5001

# Node ESM
cd /tmp/bun-host-test/full-build/bundle
PORT=5002 MONGO_URL=mongodb://localhost:27017/bench ROOT_URL=http://localhost:5002 \
  node index.mjs &
bash bench.sh "Node-ESM" 5002

# Bun ESM
cd /home/ber/Tech/meteor/meteor-sandbox/migration-bun/bun-only
PORT=5003 MONGO_URL=mongodb://localhost:27017/bench ROOT_URL=http://localhost:5003 \
  bun bun-host.mjs /tmp/bun-host-test/full-build/bundle/programs/server &
bash bench/bench.sh "Bun-ESM" 5003

# Realistic workload
node bench/ws-realistic.mjs ws://localhost:5001/websocket  # Node legacy
node bench/ws-realistic.mjs ws://localhost:5002/websocket  # Node ESM
node bench/ws-realistic.mjs ws://localhost:5003/websocket  # Bun ESM

# Burst diagnostic
node bench/ws-burst-diagnostic.mjs ws://localhost:5003/websocket

# Soak test (5 min, 20 clients)
node bench/soak-test.mjs ws://localhost:5003/websocket 300 20
```
