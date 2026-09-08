#!/usr/bin/env node
// DDP smoke test against a running Meteor server bundle.
//
// Asserts the three primitives a server bundle must provide: a DDP connection,
// a method call, and a subscription that becomes ready and delivers a document.
// Runs on Node and on Bun, and uses the global WebSocket so it needs no
// dependencies of its own.
//
// Usage: esm-bun-smoke.mjs ws://localhost:3000/websocket

const url = process.argv[2];
if (!url) {
  console.error('usage: esm-bun-smoke.mjs <ws-url>');
  process.exit(2);
}

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 60000);
const ws = new WebSocket(url);
const send = (msg) => ws.send(JSON.stringify(msg));

let stage = 'DDP connect';
const seen = { connected: false, methodResult: false, subReady: false, added: false };

const result = new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error(`timed out after ${TIMEOUT_MS}ms waiting for: ${stage}`)),
    TIMEOUT_MS,
  );
  const settle = (error) => {
    clearTimeout(timer);
    error ? reject(error) : resolve();
  };

  ws.addEventListener('open', () => {
    send({ msg: 'connect', version: '1', support: ['1'] });
  });

  ws.addEventListener('error', () => settle(new Error(`websocket error (${stage})`)));
  ws.addEventListener('close', () => {
    if (!seen.added) settle(new Error(`connection closed during: ${stage}`));
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    } catch {
      return; // SockJS framing noise; the raw /websocket endpoint sends plain DDP
    }

    switch (msg.msg) {
      case 'ping':
        send({ msg: 'pong', id: msg.id });
        break;

      case 'connected':
        seen.connected = true;
        console.log('ok  DDP connected  session=' + msg.session);
        stage = 'method call';
        send({ msg: 'method', id: '1', method: 'smoke.echo', params: ['hello'] });
        break;

      case 'result':
        if (msg.error) return settle(new Error('method returned an error: ' + JSON.stringify(msg.error)));
        if (msg.result?.echoed !== 'hello') {
          return settle(new Error('unexpected method result: ' + JSON.stringify(msg.result)));
        }
        seen.methodResult = true;
        console.log('ok  method smoke.echo returned ' + JSON.stringify(msg.result));
        stage = 'subscription';
        send({ msg: 'sub', id: '2', name: 'smoke.items', params: [] });
        break;

      case 'added':
        seen.added = true;
        console.log('ok  document added from publication  collection=' + msg.collection);
        if (seen.subReady) settle();
        break;

      case 'ready':
        seen.subReady = true;
        console.log('ok  subscription ready');
        if (seen.added) settle();
        break;

      case 'nosub':
        settle(new Error('subscription refused: ' + JSON.stringify(msg.error)));
        break;
    }
  });
});

try {
  await result;
  console.log('\nESM bundle smoke test passed (connection, method, publication).');
  process.exit(0);
} catch (error) {
  console.error('\nSMOKE TEST FAILED: ' + error.message);
  console.error('reached: ' + JSON.stringify(seen));
  process.exit(1);
} finally {
  try { ws.close(); } catch {}
}
