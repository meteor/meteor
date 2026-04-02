#!/usr/bin/env bun
// ws-raw-bridge-test.mjs — Test if EventEmitter is the bottleneck
//
// Creates a minimal Bun.serve WebSocket echo that bypasses EventEmitter entirely.
// Measures raw message throughput to isolate Bun's WS from the bridge overhead.
//
// Usage: bun ws-raw-bridge-test.mjs

const PORT = 5555;

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      return server.upgrade(req) ? undefined : new Response('fail', { status: 400 });
    }
    return new Response('ws-raw-bridge-test');
  },
  websocket: {
    message(ws, msg) {
      // Echo immediately — no EventEmitter, no adapter, no DDP parsing
      ws.send(msg);
    },
  },
});

console.log(`Raw WS echo server on port ${PORT}`);
console.log('Run the client test with:');
console.log(`  node ws-raw-bridge-client.mjs ws://localhost:${PORT}`);
