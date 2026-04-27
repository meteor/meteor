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

// --- SWC runtime helpers -----------------------------------------------------
// Handlers are serialized via Function.prototype.toString() in the parent.
// Meteor's SWC pipeline targets es2015 on the server, so async arrows are
// lowered into calls to module-scoped helpers (e.g. _async_to_generator). The
// helpers are inlined into the source module and are NOT part of the function
// body that toString() emits, so they must be injected as outer-scope bindings
// when the body is recompiled here. Helpers are reproduced verbatim from
// @swc/helpers so behavior matches what SWC inlines at the call site.

function _asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }
  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}

function _async_to_generator(fn) {
  return function () {
    var self = this, args = arguments;
    return new Promise(function (resolve, reject) {
      var gen = fn.apply(self, args);
      function _next(value) { _asyncGeneratorStep(gen, resolve, reject, _next, _throw, 'next', value); }
      function _throw(err) { _asyncGeneratorStep(gen, resolve, reject, _next, _throw, 'throw', err); }
      _next(undefined);
    });
  };
}

const _SWC_HELPER_NAMES = ['_async_to_generator', '_asyncGeneratorStep'];
const _SWC_HELPER_VALUES = [_async_to_generator, _asyncGeneratorStep];

// --- Function compilation cache ----------------------------------------------
// Avoids re-parsing identical handler strings on every task dispatch.
// Uses insertion-order eviction when the cache exceeds its size cap.

const _fnCache = new Map();
const _FN_CACHE_MAX = 256;

function _compileHandler(fnString) {
  let fn = _fnCache.get(fnString);
  if (!fn) {
    fn = new Function(
      ..._SWC_HELPER_NAMES,
      'return (' + fnString + ')'
    )(..._SWC_HELPER_VALUES);
    if (_fnCache.size >= _FN_CACHE_MAX) {
      // Evict the oldest entry (first key in Map iteration order).
      const firstKey = _fnCache.keys().next().value;
      _fnCache.delete(firstKey);
    }
    _fnCache.set(fnString, fn);
  }
  return fn;
}

// Pre-compiled named handlers (populated during initialization).
const _compiledHandlers = Object.create(null);

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
  if (workerData.hydrateContextPath && port) {
    try {
      const mod = require(workerData.hydrateContextPath);
      if (mod && typeof mod.hydrateContext === 'function') {
        const ctx = mod.hydrateContext(port, { settings, userId, callTimeout });
        Collections = ctx.Collections;
        MeteorStub = ctx.Meteor;
        return;
      }
    } catch {
      // The resolved path may be a virtual Meteor module ID that plain Node
      // require() cannot load. Fall through to the minimal stub so the worker
      // can still run CPU-only tasks.
    }
  }
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

// --- Task execution ----------------------------------------------------------

async function executeTask(task) {
  const { id, fnString, data, handlerName } = task;

  const context = { Collections, Meteor: MeteorStub };

  try {
    let fn;
    if (fnString) {
      fn = _compileHandler(fnString);
    } else if (handlerName) {
      fn = _compiledHandlers[handlerName];
      if (!fn) {
        throw new Error(`Unknown handler: ${handlerName}`);
      }
    } else {
      throw new Error('Task must include either fnString or handlerName');
    }

    const result = await fn(data, context);

    parentPort.postMessage({
      type: MSG.RESULT,
      id,
      result,
    });
  } catch (err) {
    const errObj = {
      message: err.message,
      stack: err.stack,
      name: err.name,
    };
    if (err.error !== undefined) errObj.meteorError = err.error;
    if (err.reason !== undefined) errObj.meteorReason = err.reason;
    if (err.details !== undefined) errObj.meteorDetails = err.details;

    parentPort.postMessage({
      type: MSG.ERROR,
      id,
      error: errObj,
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

  // Pre-compile named handlers so they're ready before any task arrives.
  if (workerData.handlers) {
    for (const name of Object.keys(workerData.handlers)) {
      _compiledHandlers[name] = _compileHandler(workerData.handlers[name]);
    }
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
