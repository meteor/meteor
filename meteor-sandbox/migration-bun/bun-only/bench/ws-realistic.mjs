#!/usr/bin/env node
// ws-realistic.mjs — Realistic Meteor workload benchmark
//
// Simulates actual production patterns:
//   - N clients connect (each with 1 DDP connection, like a browser)
//   - Each client does a mix of: subscribe, method call, ping/pong
//   - Calls are sequential per client (method → wait result → next), parallel across clients
//   - Measures aggregate throughput and per-client latency
//
// Scenarios:
//   "small"    — 10 clients, 20 ops each (small team app)
//   "medium"   — 50 clients, 10 ops each (typical SaaS)
//   "busy"     — 100 clients, 5 ops each (busy dashboard)
//   "spike"    — 200 clients, 2 ops each (traffic spike)
//
// Usage: node ws-realistic.mjs ws://localhost:3000/websocket

import WebSocket from 'ws';

const url = process.argv[2] || 'ws://localhost:3000/websocket';

function createClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    const pending = new Map();
    const subs = new Map();

    ws.on('open', () => {
      ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.msg === 'connected') resolve(client);
      if (msg.msg === 'result' && pending.has(msg.id)) {
        pending.get(msg.id)();
        pending.delete(msg.id);
      }
      if (msg.msg === 'ready' && msg.subs) {
        for (const id of msg.subs) {
          if (subs.has(id)) { subs.get(id)(); subs.delete(id); }
        }
      }
      if (msg.msg === 'nosub' && subs.has(msg.id)) {
        subs.get(msg.id)();
        subs.delete(msg.id);
      }
      // pong is handled by DDP protocol automatically
    });

    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 10000);

    const client = {
      callMethod() {
        return new Promise((res) => {
          const id = String(++msgId);
          pending.set(id, res);
          ws.send(JSON.stringify({ msg: 'method', method: 'nonexistent', params: [], id }));
        });
      },
      subscribe() {
        return new Promise((res) => {
          const id = String(++msgId);
          subs.set(id, res);
          ws.send(JSON.stringify({ msg: 'sub', id, name: 'nonexistent', params: [] }));
        });
      },
      ping() {
        return new Promise((res) => {
          // DDP ping — server responds with pong
          ws.send(JSON.stringify({ msg: 'ping' }));
          // pong comes back but we don't track it individually, just yield
          setTimeout(res, 1);
        });
      },
      close() { ws.close(); },
    };
  });
}

// A realistic client session: subscribe, then method calls, then ping
async function clientSession(client, opsCount) {
  const latencies = [];

  // 1 subscribe (typical: open page → subscribe to data)
  let t = performance.now();
  await client.subscribe();
  latencies.push(performance.now() - t);

  // N-2 method calls (typical: user actions)
  for (let i = 0; i < Math.max(0, opsCount - 2); i++) {
    t = performance.now();
    await client.callMethod();
    latencies.push(performance.now() - t);
  }

  // 1 ping (heartbeat)
  if (opsCount >= 2) {
    t = performance.now();
    await client.ping();
    latencies.push(performance.now() - t);
  }

  return latencies;
}

async function runScenario(label, numClients, opsPerClient) {
  // Connect all clients
  const clients = [];
  const connectStart = performance.now();
  for (let i = 0; i < numClients; i++) {
    clients.push(await createClient(url));
  }
  const connectMs = performance.now() - connectStart;

  // Run all client sessions in parallel
  const start = performance.now();
  const results = await Promise.all(
    clients.map(c => clientSession(c, opsPerClient))
  );
  const elapsed = performance.now() - start;

  // Aggregate
  const allLatencies = results.flat().filter(l => l < 1000); // exclude ping timeout
  allLatencies.sort((a, b) => a - b);
  const totalOps = numClients * opsPerClient;
  const throughput = (totalOps / elapsed * 1000).toFixed(0);
  const mean = (allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length).toFixed(2);
  const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)]?.toFixed(2) || '?';
  const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)]?.toFixed(2) || '?';
  const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)]?.toFixed(2) || '?';

  console.log(`  ${label} (${numClients} clients × ${opsPerClient} ops):`);
  console.log(`    Connect: ${connectMs.toFixed(0)} ms | Total: ${elapsed.toFixed(0)} ms | Throughput: ${throughput} ops/sec`);
  console.log(`    Latency — mean: ${mean} ms | P50: ${p50} ms | P95: ${p95} ms | P99: ${p99} ms`);

  // Cleanup
  clients.forEach(c => c.close());
  await new Promise(r => setTimeout(r, 300));

  return { throughput: parseFloat(throughput), mean: parseFloat(mean), elapsed };
}

console.log(`Realistic Meteor workload → ${url}\n`);

const r1 = await runScenario('Small team ', 10, 20);
const r2 = await runScenario('Typical SaaS', 50, 10);
const r3 = await runScenario('Busy dashboard', 100, 5);
const r4 = await runScenario('Traffic spike', 200, 2);

console.log('\nSummary:');
console.log(`  Small:  ${r1.throughput} ops/sec (${r1.mean} ms avg)`);
console.log(`  SaaS:   ${r2.throughput} ops/sec (${r2.mean} ms avg)`);
console.log(`  Busy:   ${r3.throughput} ops/sec (${r3.mean} ms avg)`);
console.log(`  Spike:  ${r4.throughput} ops/sec (${r4.mean} ms avg)`);
