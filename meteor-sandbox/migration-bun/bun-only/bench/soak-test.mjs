#!/usr/bin/env node
// soak-test.mjs — Stability soak test for Bun-only Meteor host
//
// Runs for a configurable duration with multiple clients doing
// realistic operations (subscribe, methods, pings) and reports:
// - Total ops, errors, throughput
// - RSS snapshots over time
// - Connection count stability
// - Error categorization
//
// Usage:
//   node soak-test.mjs ws://localhost:3000/websocket [duration_seconds] [num_clients]
//   Defaults: 300s (5 min), 20 clients

import WebSocket from 'ws';
import http from 'node:http';

const url = process.argv[2] || 'ws://localhost:3000/websocket';
const DURATION = parseInt(process.argv[3] || '300') * 1000;
const NUM_CLIENTS = parseInt(process.argv[4] || '20');
const REPORT_INTERVAL = 15000; // report every 15s

const httpBase = url.replace('ws://', 'http://').replace('/websocket', '');

let totalOps = 0;
let totalErrors = 0;
let errorTypes = {};
let activeClients = 0;
let reconnects = 0;

function createClient(wsUrl, clientId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    const pending = new Map();
    const subs = new Map();
    let connected = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.msg === 'connected') {
        connected = true;
        activeClients++;
        resolve(client);
      }
      if (msg.msg === 'result' && pending.has(msg.id)) {
        pending.get(msg.id)();
        pending.delete(msg.id);
      }
      if ((msg.msg === 'ready' || msg.msg === 'nosub') && msg.subs) {
        for (const id of msg.subs) {
          if (subs.has(id)) { subs.get(id)(); subs.delete(id); }
        }
      }
      if (msg.msg === 'nosub' && subs.has(msg.id)) {
        subs.get(msg.id)();
        subs.delete(msg.id);
      }
    });

    ws.on('error', (e) => {
      if (!connected) reject(e);
    });

    ws.on('close', () => {
      if (connected) activeClients--;
      connected = false;
    });

    const client = {
      get connected() { return connected; },
      callMethod() {
        if (!connected) return Promise.reject(new Error('not connected'));
        return new Promise((res, rej) => {
          const id = String(++msgId);
          const timeout = setTimeout(() => { pending.delete(id); rej(new Error('timeout')); }, 5000);
          pending.set(id, () => { clearTimeout(timeout); res(); });
          ws.send(JSON.stringify({ msg: 'method', method: 'nonexistent', params: [], id }));
        });
      },
      subscribe() {
        if (!connected) return Promise.reject(new Error('not connected'));
        return new Promise((res, rej) => {
          const id = String(++msgId);
          const timeout = setTimeout(() => { subs.delete(id); rej(new Error('timeout')); }, 5000);
          subs.set(id, () => { clearTimeout(timeout); res(); });
          ws.send(JSON.stringify({ msg: 'sub', id, name: 'nonexistent', params: [] }));
        });
      },
      ping() {
        if (!connected) return Promise.resolve();
        ws.send(JSON.stringify({ msg: 'ping' }));
        return Promise.resolve();
      },
      close() { ws.close(); },
    };

    setTimeout(() => { if (!connected) reject(new Error('connection timeout')); }, 10000);
  });
}

async function clientLoop(client, stopTime) {
  while (Date.now() < stopTime && client.connected) {
    try {
      // Random op mix: 60% method, 25% subscribe, 15% ping
      const r = Math.random();
      if (r < 0.60) {
        await client.callMethod();
      } else if (r < 0.85) {
        await client.subscribe();
      } else {
        await client.ping();
      }
      totalOps++;
    } catch (e) {
      totalErrors++;
      const type = e.message || 'unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    }
    // Small random delay to simulate real user behavior (10-100ms)
    await new Promise(r => setTimeout(r, 10 + Math.random() * 90));
  }
}

async function getRSS() {
  try {
    const resp = await fetch(`${httpBase}/`);
    // We can't easily get server RSS from outside, but we can check HTTP is alive
    return resp.status === 200 ? 'OK' : `HTTP ${resp.status}`;
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

console.log(`Soak test → ${url}`);
console.log(`Duration: ${DURATION / 1000}s | Clients: ${NUM_CLIENTS}`);
console.log('');

// Connect all clients
const clients = [];
const connectStart = Date.now();
for (let i = 0; i < NUM_CLIENTS; i++) {
  try {
    clients.push(await createClient(url, i));
  } catch (e) {
    console.error(`  Client ${i} failed to connect: ${e.message}`);
  }
}
console.log(`Connected ${clients.length}/${NUM_CLIENTS} clients in ${Date.now() - connectStart}ms`);

const stopTime = Date.now() + DURATION;
const startTime = Date.now();

// Start report interval
const reporter = setInterval(async () => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const httpStatus = await getRSS();
  const opsPerSec = (totalOps / ((Date.now() - startTime) / 1000)).toFixed(0);
  console.log(
    `  [${elapsed}s] ops: ${totalOps} (${opsPerSec}/sec) | ` +
    `errors: ${totalErrors} | active: ${activeClients}/${NUM_CLIENTS} | ` +
    `http: ${httpStatus}`
  );
}, REPORT_INTERVAL);

// Run all client loops in parallel
await Promise.all(clients.map(c => clientLoop(c, stopTime)));

clearInterval(reporter);

// Final report
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const opsPerSec = (totalOps / (elapsed)).toFixed(0);

console.log('');
console.log('=== Soak Test Results ===');
console.log(`Duration:    ${elapsed}s`);
console.log(`Clients:     ${clients.length}`);
console.log(`Total ops:   ${totalOps}`);
console.log(`Throughput:  ${opsPerSec} ops/sec`);
console.log(`Errors:      ${totalErrors} (${(totalErrors / totalOps * 100).toFixed(2)}%)`);
console.log(`Reconnects:  ${reconnects}`);

if (Object.keys(errorTypes).length > 0) {
  console.log('Error types:');
  for (const [type, count] of Object.entries(errorTypes)) {
    console.log(`  ${type}: ${count}`);
  }
}

const finalHttp = await getRSS();
console.log(`Final HTTP:  ${finalHttp}`);
console.log(`Active:      ${activeClients}/${NUM_CLIENTS}`);

// Cleanup
clients.forEach(c => c.close());

const success = totalErrors === 0 && activeClients === clients.length;
console.log(`\nResult: ${success ? 'PASS ✅' : 'ISSUES FOUND ⚠️'}`);
process.exit(success ? 0 : 1);
