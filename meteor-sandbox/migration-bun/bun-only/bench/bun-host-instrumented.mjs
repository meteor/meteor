#!/usr/bin/env bun
// bun-host-instrumented.mjs — bun-host with timing instrumentation
// Same as bun-host.mjs but with performance.now() around key paths
// to identify where the per-socket burst bottleneck is.

import path from 'node:path';
import fs from 'node:fs';
import { bootPackages, runMain } from '../../spike/esm-loader.mjs';
import { BunSocket } from '../bun-ddp-transport.mjs';

const bundlePath = process.argv[2];
if (!bundlePath) { console.error('Usage: bun bun-host-instrumented.mjs <serverDir>'); process.exit(1); }

const serverDir = path.resolve(bundlePath);
const PORT = parseInt(process.env.PORT || '3000');
const SOCK_PATH = `/tmp/meteor-bun-${process.pid}.sock`;

console.log(`[instrumented] Booting from ${serverDir}`);
await bootPackages(serverDir);

// --- Instrumentation state ---
let msgCount = 0;
let emitTotal = 0;
let sendTotal = 0;
const REPORT_EVERY = 100;

const WebApp = Package.webapp.WebApp;

WebApp.startListening = function(httpServer, listenOptions, cb) {
  try { fs.unlinkSync(SOCK_PATH); } catch (e) {}

  httpServer.listen({ path: SOCK_PATH }, () => {
    console.log(`[instrumented] Express on ${SOCK_PATH}`);

    const bunServer = Bun.serve({
      port: PORT,
      hostname: process.env.BIND_IP || '0.0.0.0',

      async fetch(req, server) {
        if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
          const url = new URL(req.url, `http://localhost:${PORT}`);
          const wsPath = url.pathname;
          if (wsPath === '/websocket' || wsPath.endsWith('/sockjs/websocket')) {
            const ok = server.upgrade(req, { data: { req } });
            return ok ? undefined : new Response('fail', { status: 400 });
          }
        }
        const url = new URL(req.url, `http://localhost:${PORT}`);
        try {
          return await fetch(
            new Request(`http://localhost${url.pathname}${url.search}`, {
              method: req.method, headers: req.headers,
              body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
              redirect: 'manual',
            }), { unix: SOCK_PATH }
          );
        } catch (e) { return new Response('proxy error', { status: 502 }); }
      },

      websocket: {
        open(ws) {
          const socket = new BunSocket(ws, ws.data.req);
          ws.data.socket = socket;

          const streamServer = Package.meteor.Meteor.server.stream_server;
          streamServer.open_sockets.push(socket);
          streamServer.registration_callbacks.forEach(cb => cb(socket));

          // --- Instrument: wrap Session.processMessage ---
          // After registration, socket._meteorSession should be set
          // We patch send to measure response time
          const origSend = socket.send.bind(socket);
          socket.send = function(data) {
            const t0 = performance.now();
            origSend(data);
            sendTotal += performance.now() - t0;
          };
        },

        message(ws, msg) {
          const data = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);

          const t0 = performance.now();
          ws.data.socket.emit('data', data);
          emitTotal += performance.now() - t0;

          msgCount++;
          if (msgCount % REPORT_EVERY === 0) {
            console.log(
              `[timing] ${msgCount} msgs | ` +
              `emit avg: ${(emitTotal / msgCount).toFixed(3)} ms | ` +
              `send avg: ${(sendTotal / msgCount).toFixed(3)} ms`
            );
          }
        },

        close(ws) {
          const socket = ws.data.socket;
          if (socket) {
            const streamServer = Package.meteor.Meteor.server.stream_server;
            streamServer.open_sockets = streamServer.open_sockets.filter(s => s !== socket);
            socket.emit('close');
          }
          // Print final timing
          if (msgCount > 0) {
            console.log(
              `[timing-final] ${msgCount} msgs | ` +
              `emit avg: ${(emitTotal / msgCount).toFixed(3)} ms | ` +
              `send avg: ${(sendTotal / msgCount).toFixed(3)} ms`
            );
            msgCount = 0; emitTotal = 0; sendTotal = 0;
          }
        },
      },
    });

    console.log(`[instrumented] Bun.serve() on port ${PORT}`);
    cb();
  });

  const cleanup = () => { try { fs.unlinkSync(SOCK_PATH); } catch (e) {} };
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('exit', cleanup);
};

await runMain();
