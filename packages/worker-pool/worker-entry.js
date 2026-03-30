/**
 * @module worker-pool/worker-entry
 * @summary Built-in worker script that runs inside each pooled worker thread.
 *
 * This file is loaded as an asset via `Assets.absoluteFilePath` and executed
 * by Node's `worker_threads.Worker`. It does NOT run through Meteor's module
 * system, so it uses plain `require` / CommonJS and the raw `worker_threads`
 * API.
 *
 * Lifecycle:
 *   1. Receive `workerData` with thread-context port, settings, userId, etc.
 *   2. Hydrate the Meteor API surface via thread-context's BridgeClient.
 *   3. Signal "ready" to the parent.
 *   4. Listen for task messages, execute, and post results back.
 *   5. Respond to heartbeat pings.
 */

'use strict';

const { parentPort, workerData } = require('worker_threads');

// --- Message types -----------------------------------------------------------
const MSG = {
  READY: 'ready',
  TASK: 'task',
  RESULT: 'result',
  ERROR: 'error',
  HEARTBEAT_PING: 'heartbeat:ping',
  HEARTBEAT_PONG: 'heartbeat:pong',
  SHUTDOWN: 'shutdown',
};

// --- Thread-context hydration ------------------------------------------------
// The thread-context package exposes a worker-side API that reconstructs the
// Meteor API surface from a transferred MessagePort. We load it dynamically
// because this file runs outside Meteor's module system.

let Collections = null;
let MeteorStub = null;

function hydrateFromPort(port, settings, userId, callTimeout) {
  // thread-context's BridgeClient + proxy factories are bundled into the
  // Meteor app. We need to load them from the app's node_modules or the
  // Meteor package cache. The parent passes the resolved paths via workerData.
  if (workerData.hydrateContextPath) {
    // The parent resolved the path to the thread-context worker module for us.
    const { hydrateContext } = require(workerData.hydrateContextPath);
    const ctx = hydrateContext(port, { settings, userId, callTimeout });
    Collections = ctx.Collections;
    MeteorStub = ctx.Meteor;
  } else {
    // Fallback: create a minimal stub when no thread-context path is provided.
    // This allows running the pool without thread-context for simple CPU tasks.
    Collections = null;
    MeteorStub = {
      settings: Object.freeze(settings || {}),
      userId: userId || null,
      isServer: true,
      isClient: false,
      isSimulation: false,
      callAsync() {
        throw new Error('Meteor.callAsync is not available without thread-context');
      },
    };
  }
}

// --- Task execution ----------------------------------------------------------

async function executeTask(task) {
  const { id, fnString, data, handlerName } = task;

  const context = { Collections, Meteor: MeteorStub };

  try {
    let fn;
    if (fnString) {
      // Reconstruct the function from its serialized string.
      // Supports named functions, arrow functions, and async functions.
      fn = new Function('return (' + fnString + ')')();
    } else if (handlerName && workerData.handlers && workerData.handlers[handlerName]) {
      // Named handler passed via workerData (pre-registered).
      fn = new Function('return (' + workerData.handlers[handlerName] + ')')();
    } else {
      throw new Error(
        handlerName
          ? `Unknown handler: ${handlerName}`
          : 'Task must include either fnString or handlerName'
      );
    }

    const result = await fn(data, context);

    parentPort.postMessage({
      type: MSG.RESULT,
      id,
      result,
    });
  } catch (err) {
    parentPort.postMessage({
      type: MSG.ERROR,
      id,
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
        ...(err.error !== undefined ? { meteorError: err.error } : {}),
        ...(err.reason !== undefined ? { meteorReason: err.reason } : {}),
        ...(err.details !== undefined ? { meteorDetails: err.details } : {}),
      },
    });
  }
}

// --- Message handler ---------------------------------------------------------

parentPort.on('message', (msg) => {
  switch (msg.type) {
    case MSG.TASK:
      executeTask(msg);
      break;

    case MSG.HEARTBEAT_PING:
      parentPort.postMessage({ type: MSG.HEARTBEAT_PONG, ts: Date.now() });
      break;

    case MSG.SHUTDOWN:
      // Graceful shutdown: let the current event loop tick complete, then exit.
      setImmediate(() => process.exit(0));
      break;

    default:
      // Unknown message type — ignore.
      break;
  }
});

// --- Initialization ----------------------------------------------------------

try {
  if (workerData.port) {
    hydrateFromPort(
      workerData.port,
      workerData.settings,
      workerData.userId,
      workerData.callTimeout
    );
  } else {
    // No port — initialize minimal stubs for CPU-only tasks.
    hydrateFromPort(null, workerData.settings, workerData.userId, workerData.callTimeout);
  }
} catch (err) {
  parentPort.postMessage({
    type: MSG.ERROR,
    id: '__init__',
    error: { message: err.message, stack: err.stack, name: err.name },
  });
  process.exit(1);
}

// Signal that the worker is ready.
parentPort.postMessage({ type: MSG.READY });
