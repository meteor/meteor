/**
 * @module hcp
 * @description Shared HCP-mode predicates for Capacitor build integration.
 */

export { getCapacitorHcpMode } from './config.js';

export function isHcpEnabled(mode) {
  return mode === 'webapp';
}

export function shouldShipManifest(mode) {
  return isHcpEnabled(mode);
}
