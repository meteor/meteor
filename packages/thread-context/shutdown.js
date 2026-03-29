const activeBridges = new Set();

export function registerBridge(host) {
  activeBridges.add(host);
}

export function unregisterBridge(host) {
  activeBridges.delete(host);
}

export function destroyAllBridges() {
  const bridges = [...activeBridges];
  activeBridges.clear();
  for (const host of bridges) {
    host.destroy();
  }
}

export function getActiveBridgeCount() {
  return activeBridges.size;
}

process.on('SIGTERM', destroyAllBridges);
process.on('SIGINT', destroyAllBridges);
