#!/usr/bin/env node
// ws-bench.mjs — DDP WebSocket roundtrip latency + throughput benchmark
//
// Usage: node ws-bench.mjs ws://localhost:3000/websocket

import WebSocket from 'ws';

const url = process.argv[2] || 'ws://localhost:3000/websocket';
const WARMUP = 50;
const ITERATIONS = 500;

let msgId = 0;
const nextId = () => String(++msgId);

async function run() {
  const ws = new WebSocket(url);
  const pending = new Map();

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.msg === 'connected') resolve();
      if (msg.msg === 'result' && pending.has(msg.id)) {
        pending.get(msg.id)();
        pending.delete(msg.id);
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });

  // Helper: call a method and wait for result
  function callMethod() {
    return new Promise((resolve) => {
      const id = nextId();
      pending.set(id, resolve);
      ws.send(JSON.stringify({ msg: 'method', method: 'nonexistent', params: [], id }));
    });
  }

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await callMethod();
  }

  // Latency benchmark (sequential calls)
  const latencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await callMethod();
    latencies.push(performance.now() - start);
  }

  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);
  const mean = sum / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log(`DDP method roundtrip (${ITERATIONS} calls, sequential):`);
  console.log(`  Mean:  ${mean.toFixed(2)} ms`);
  console.log(`  P50:   ${p50.toFixed(2)} ms`);
  console.log(`  P95:   ${p95.toFixed(2)} ms`);
  console.log(`  P99:   ${p99.toFixed(2)} ms`);
  console.log(`  Throughput: ${(1000 / mean).toFixed(0)} calls/sec`);

  // Throughput benchmark (parallel burst)
  const BURST = 200;
  const burstStart = performance.now();
  await Promise.all(Array.from({ length: BURST }, () => callMethod()));
  const burstMs = performance.now() - burstStart;
  console.log(`DDP parallel burst (${BURST} concurrent calls):`);
  console.log(`  Total: ${burstMs.toFixed(1)} ms`);
  console.log(`  Throughput: ${(BURST / burstMs * 1000).toFixed(0)} calls/sec`);

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
