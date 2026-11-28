/**
 * @module capacitor_client
 * @description Client-side runtime flags for the capacitor package.
 */

import { Meteor } from 'meteor/meteor';

export function detectIsCapacitorRuntime(runtime = globalThis) {
  return !!(
    Meteor.isCordova &&
    runtime &&
    runtime.Capacitor &&
    typeof runtime.Capacitor.isNativePlatform === 'function' &&
    runtime.Capacitor.isNativePlatform()
  );
}

Meteor.isCapacitor = detectIsCapacitorRuntime();
