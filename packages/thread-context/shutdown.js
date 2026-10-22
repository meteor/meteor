/**
 * @module thread-context/shutdown
 * @summary Global registry of active BridgeHost instances with
 * automatic cleanup on SIGTERM/SIGINT.
 */

/** @type {Set<import('./bridge-host.js').BridgeHost>} */
const activeBridges = new Set();

/**
 * Registers a BridgeHost so it will be destroyed on process shutdown.
 * Called automatically by the BridgeHost constructor.
 * @param {import('./bridge-host.js').BridgeHost} host
 */
export function registerBridge(host) {
  activeBridges.add(host);
}

/**
 * Removes a BridgeHost from the shutdown registry.
 * Called automatically by `BridgeHost.destroy()`.
 * @param {import('./bridge-host.js').BridgeHost} host
 */
export function unregisterBridge(host) {
  activeBridges.delete(host);
}

/**
 * Destroys all active bridge hosts immediately. Snapshots the set
 * before iterating to avoid mutation-during-iteration issues.
 */
export function destroyAllBridges() {
  const bridges = [...activeBridges];
  activeBridges.clear();
  for (const host of bridges) {
    try {
      host.destroy();
    } catch (e) {
      console.error('[thread-context] Error destroying bridge during shutdown:', e);
    }
  }
}

/**
 * Returns the number of currently active (not yet destroyed) bridge hosts.
 * @returns {number}
 */
export function getActiveBridgeCount() {
  return activeBridges.size;
}

/** @type {boolean} */
let handlersInstalled = false;

/**
 * Installs process-level `SIGTERM`/`SIGINT` handlers that destroy all active
 * bridges before the process exits. Opt-in — call this once from the host
 * application if you want automatic bridge cleanup on signal.
 *
 * After teardown, the signal is re-raised so the process exits naturally
 * (honoring any other handlers and the default termination action). Pass
 * `{ exit: true }` to call `process.exit(code)` instead, using the
 * conventional exit codes (143 for `SIGTERM`, 130 for `SIGINT`).
 *
 * Idempotent — subsequent calls are no-ops.
 *
 * @param {{ exit?: boolean }} [options]
 */
export function installShutdownHandlers({ exit = false } = {}) {
  if (handlersInstalled) return;
  handlersInstalled = true;

  const onSignal = async (signal) => {
    try {
      await destroyAllBridges();
    } catch (e) {
      console.error('[thread-context] Error during shutdown:', e);
    }
    if (exit) {
      process.exit(signal === 'SIGTERM' ? 143 : 130);
      return;
    }
    process.kill(process.pid, signal);
  };

  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('SIGINT', () => onSignal('SIGINT'));
}
