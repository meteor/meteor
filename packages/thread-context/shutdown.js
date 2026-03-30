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

function onSignal(signal) {
  destroyAllBridges();
  process.exit(signal === 'SIGTERM' ? 143 : 130);
}
process.once('SIGTERM', () => onSignal('SIGTERM'));
process.once('SIGINT', () => onSignal('SIGINT'));
