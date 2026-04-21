'use strict';

const { parentPort, workerData } = require('worker_threads');

// ---------------------------------------------------------------------------
// Module resolution setup
// ---------------------------------------------------------------------------
// Inherit the main thread's module resolution paths so we can require
// the same npm packages (terser, swc, babel, acorn, escope, reify, etc.)
// that live in the Meteor dev bundle's node_modules.
if (Array.isArray(workerData?.modulePaths)) {
  const existing = new Set(module.paths);
  for (const p of workerData.modulePaths) {
    if (!existing.has(p)) {
      module.paths.push(p);
    }
  }
}

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------
// Each handler file exports an object mapping task type names to async
// handler functions: { 'task-type': async (payload) => result }
//
// Adding a new worker operation is as simple as creating a handler file
// and adding it to this list.
const handlers = Object.create(null);

function loadHandlers(handlerModule) {
  for (const [name, fn] of Object.entries(handlerModule)) {
    if (typeof fn === 'function') {
      handlers[name] = fn;
    }
  }
}

// Load all built-in handlers. Only operations whose npm deps live in
// dev_bundle/lib/node_modules are viable in workers. Package-specific
// npm deps (@meteorjs/swc-core, terser, cssnano, etc.) are not
// resolvable from worker threads.
const handlerModules = [
  './workers/static-analysis',
];

for (const mod of handlerModules) {
  try {
    loadHandlers(require(mod));
  } catch (err) {
    // Handler failed to load (likely a missing npm dependency).
    // Log but continue — other handlers may still work.
    // In production builds this is unlikely since all deps are bundled.
    if (process.env.METEOR_WORKER_DEBUG) {
      console.error(`[build-worker] Failed to load handler ${mod}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Message loop
// ---------------------------------------------------------------------------
parentPort.on('message', async ({ type, payload }) => {
  const handler = handlers[type];

  if (!handler) {
    parentPort.postMessage({
      error: `Unknown worker task type: "${type}". Available: ${Object.keys(handlers).join(', ')}`,
    });
    return;
  }

  try {
    const result = await handler(payload);
    parentPort.postMessage({ result });
  } catch (err) {
    parentPort.postMessage({
      error: err.message,
      stack: err.stack,
    });
  }
});
