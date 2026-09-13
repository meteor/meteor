/**
 * @module jobs/events
 * @summary Lifecycle event hooks using the callback-hook package.
 *
 * Events: enqueued, started, completed, failed, cancelled, retrying,
 * stalled, leader.acquired, leader.lost.
 *
 * Usage:
 *   import { on, emit } from './events.js';
 *   const handle = on('completed', (job) => { ... });
 *   handle.stop(); // unregister
 */

import { Hook } from 'meteor/callback-hook';

/**
 * One Hook instance per event type.
 * `bindEnvironment: false` — we manage async ourselves rather than
 * relying on Meteor's Fiber-based environment binding.
 * @private
 */
const hooks = {
  enqueued: new Hook({ bindEnvironment: false }),
  started: new Hook({ bindEnvironment: false }),
  completed: new Hook({ bindEnvironment: false }),
  failed: new Hook({ bindEnvironment: false }),
  cancelled: new Hook({ bindEnvironment: false }),
  retrying: new Hook({ bindEnvironment: false }),
  stalled: new Hook({ bindEnvironment: false }),
  'leader.acquired': new Hook({ bindEnvironment: false }),
  'leader.lost': new Hook({ bindEnvironment: false }),
};

/**
 * Register a callback for a lifecycle event.
 *
 * @param {string}   event     One of the supported event names.
 * @param {Function} callback  The function to invoke when the event fires.
 * @returns {{ stop: Function }}  A handle whose `.stop()` method unregisters
 *   the callback.
 * @throws {Error} If `event` is not a recognised event name.
 */
export function on(event, callback) {
  if (!hooks[event]) {
    throw new Error(`Jobs: unknown event "${event}". ` +
      `Valid events: ${Object.keys(hooks).join(', ')}`);
  }
  return hooks[event].register(callback);
}

/**
 * Emit a lifecycle event, invoking all registered callbacks concurrently.
 *
 * Errors thrown by individual callbacks are caught and logged so that
 * a misbehaving listener never breaks the core job flow.  Callbacks run
 * in parallel via `Promise.allSettled` so a slow listener does not block
 * the others.
 *
 * @param {string} event  The event name.
 * @param {...*}   args   Arguments forwarded to every registered callback.
 * @returns {Promise<void>}
 */
export async function emit(event, ...args) {
  const hook = hooks[event];
  if (!hook) return;

  try {
    // Collect all currently-registered callbacks (synchronous iteration).
    const callbacks = [];
    hook.forEach((cb) => {
      callbacks.push(cb);
      return true; // continue iteration
    });

    if (callbacks.length === 0) return;

    // Run all callbacks concurrently.
    const results = await Promise.allSettled(
      callbacks.map(cb => {
        try {
          return Promise.resolve(cb(...args));
        } catch (syncErr) {
          return Promise.reject(syncErr);
        }
      })
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`[Jobs] Error in "${event}" event handler:`, result.reason);
      }
    }
  } catch (err) {
    console.error(`[Jobs] Error emitting "${event}" event:`, err);
  }
}
