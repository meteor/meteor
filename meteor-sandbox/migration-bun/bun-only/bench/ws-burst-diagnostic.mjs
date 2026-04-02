#!/usr/bin/env node
// ws-burst-diagnostic.mjs — Diagnose DDP parallel burst regression
//
// Tests 3 patterns:
//   1. 1 connection × 200 calls (mono-connection burst)
//   2. 10 connections × 20 calls (multi-connection, moderate)
//   3. 50 connections × 4 calls (many-connection, light per socket)
//
// Usage: node ws-burst-diagnostic.mjs ws://localhost:3000/websocket

import WebSocket from 'ws';

const url = process.argv[2] || 'ws://localhost:3000/websocket';
const TOTAL_CALLS = 200;

function createClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    const pending = new Map();

    ws.on('open', () => {
      ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.msg === 'connected') {
        resolve({
          call() {
            return new Promise((res) => {
              const id = String(++msgId);
              pending.set(id, res);
              ws.send(JSON.stringify({ msg: 'method', method: 'nonexistent', params: [], id }));
            });
          },
          close() { ws.close(); },
        });
      }
      if (msg.msg === 'result' && pending.has(msg.id)) {
        pending.get(msg.id)();
        pending.delete(msg.id);
      }
    });

    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

async function runPattern(label, numConns, callsPerConn) {
  // Connect all clients
  const clients = await Promise.all(
    Array.from({ length: numConns }, () => createClient(url))
  );

  // Warmup: 5 sequential calls per client
  for (const c of clients) {
    for (let i = 0; i < 5; i++) await c.call();
  }

  // Burst: all clients fire their calls in parallel
  const start = performance.now();
  await Promise.all(
    clients.flatMap(c =>
      Array.from({ length: callsPerConn }, () => c.call())
    )
  );
  const elapsed = performance.now() - start;

  const totalCalls = numConns * callsPerConn;
  const throughput = (totalCalls / elapsed * 1000).toFixed(0);

  console.log(`  ${label}: ${elapsed.toFixed(1)} ms, ${throughput} calls/sec`);

  // Cleanup
  clients.forEach(c => c.close());
  // Give sockets time to close
  await new Promise(r => setTimeout(r, 200));

  return { elapsed, throughput: parseFloat(throughput) };
}

console.log(`DDP burst diagnostic → ${url}`);
console.log(`Total calls per pattern: ${TOTAL_CALLS}\n`);

const r1 = await runPattern('1 conn × 200 calls ', 1, 200);
const r2 = await runPattern('10 conn × 20 calls ', 10, 20);
const r3 = await runPattern('50 conn × 4 calls  ', 50, 4);

console.log('\nDiagnosis:');
if (r1.throughput < r2.throughput * 0.3) {
  console.log('  → Bottleneck is PER-SOCKET (single connection serializes)');
} else if (r2.throughput < r3.throughput * 0.5) {
  console.log('  → Bottleneck is in EVENT LOOP / DISPATCH (scales poorly with connections)');
} else if (r1.throughput > r2.throughput * 0.8) {
  console.log('  → Bottleneck is in SESSION/DDP processing (independent of connection count)');
} else {
  console.log('  → Mixed pattern — check per-metric analysis');
}

console.log(`\n  Mono-conn throughput:  ${r1.throughput} calls/sec`);
console.log(`  Multi-conn throughput: ${r2.throughput} calls/sec`);
console.log(`  Many-conn throughput:  ${r3.throughput} calls/sec`);
