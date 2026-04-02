#!/usr/bin/env node
// ws-raw-bridge-client.mjs — Test raw WS throughput (no DDP, no Meteor)
//
// Tests the same 3 patterns as ws-burst-diagnostic but against a raw echo server
// to isolate whether the bottleneck is in Bun's WS or in the bridge/DDP layer.
//
// Usage: node ws-raw-bridge-client.mjs ws://localhost:5555

import WebSocket from 'ws';

const url = process.argv[2] || 'ws://localhost:5555';
const TOTAL = 200;

function createClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    const pending = new Map();

    ws.on('open', () => resolve({
      call() {
        return new Promise((res) => {
          const id = ++msgId;
          const msg = JSON.stringify({ id, data: 'x'.repeat(50) });
          pending.set(id, res);
          ws.send(msg);
        });
      },
      close() { ws.close(); },
    }));

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (pending.has(msg.id)) {
        pending.get(msg.id)();
        pending.delete(msg.id);
      }
    });

    ws.on('error', reject);
    setTimeout(() => reject(new Error('timeout')), 5000);
  });
}

async function runPattern(label, numConns, callsPerConn) {
  const clients = await Promise.all(
    Array.from({ length: numConns }, () => createClient(url))
  );

  // Warmup
  for (const c of clients) {
    for (let i = 0; i < 5; i++) await c.call();
  }

  const start = performance.now();
  await Promise.all(
    clients.flatMap(c =>
      Array.from({ length: callsPerConn }, () => c.call())
    )
  );
  const elapsed = performance.now() - start;
  const throughput = (numConns * callsPerConn / elapsed * 1000).toFixed(0);

  console.log(`  ${label}: ${elapsed.toFixed(1)} ms, ${throughput} calls/sec`);

  clients.forEach(c => c.close());
  await new Promise(r => setTimeout(r, 200));

  return { elapsed, throughput: parseFloat(throughput) };
}

console.log(`Raw WS burst diagnostic → ${url}`);
console.log(`Total messages per pattern: ${TOTAL}\n`);

await runPattern('1 conn × 200 msgs ', 1, 200);
await runPattern('10 conn × 20 msgs ', 10, 20);
await runPattern('50 conn × 4 msgs  ', 50, 4);
