/**
 * ChangeStream - Per-query reactive event bus for AFS.
 *
 * Extends Node's EventEmitter to provide a standardized event interface
 * between data source providers and consumers (cursors, publications,
 * adaptive engine).
 *
 * Providers feed changes into a ChangeStream via convenience methods
 * (added, changed, removed) or directly via emit(). Consumers listen
 * via standard EventEmitter on/once/removeListener.
 *
 * Events:
 *   - added(id, fields)         — new document matches query
 *   - changed(id, fields)       — document fields changed (delta)
 *   - removed(id)               — document no longer matches
 *   - addedBefore(id, fields, before) — ordered: new doc at position
 *   - movedBefore(id, before)   — ordered: doc moved position
 *   - ready()                   — initial result set fully sent
 *   - error(err)                — query/connection error
 *   - reconnected()             — provider reconnected after disconnect
 *   - reset()                   — full result set invalidated
 *   - paused()                  — observer paused (e.g., during batch)
 *   - resumed()                 — observer resumed
 *   - stop()                    — ChangeStream is being torn down
 */

import { EventEmitter } from 'events';

export class ChangeStream extends EventEmitter {
  /**
   * @param {Object} cursorDescription - Describes the query
   * @param {Object} [options]
   * @param {boolean} [options.silentErrors=false] - If true, unlistened 'error'
   *   events are routed to Meteor._debug instead of throwing (Node default).
   *   Default is false: Node's default semantics apply and an unlistened
   *   'error' will throw.
   */
  constructor(cursorDescription, options = {}) {
    super();
    this._cursorDescription = cursorDescription;
    this._stopped = false;
    this._ready = false;
    this.silentErrors = !!options.silentErrors;
    // Allow many listeners (publications + engine + debug tools)
    this.setMaxListeners(0);
  }

  // ---------------------------------------------------------------------------
  // Override emit only when silentErrors is set; otherwise defer to Node.
  // ---------------------------------------------------------------------------

  emit(event, ...args) {
    if (
      event === 'error' &&
      this.silentErrors &&
      this.listenerCount('error') === 0
    ) {
      Meteor._debug('ChangeStream unhandled error:', args[0]);
      return false;
    }
    return super.emit(event, ...args);
  }

  // ---------------------------------------------------------------------------
  // Data change convenience methods (for providers)
  // ---------------------------------------------------------------------------

  added(id, fields)               { if (this._stopped) return; this.emit('added', id, fields); }
  changed(id, fields)             { if (this._stopped) return; this.emit('changed', id, fields); }
  removed(id)                     { if (this._stopped) return; this.emit('removed', id); }
  addedBefore(id, fields, before) { if (this._stopped) return; this.emit('addedBefore', id, fields, before); }
  movedBefore(id, before)         { if (this._stopped) return; this.emit('movedBefore', id, before); }

  // ---------------------------------------------------------------------------
  // Lifecycle event convenience methods
  // ---------------------------------------------------------------------------

  markReady() {
    if (this._stopped) return;
    this._ready = true;
    this.emit('ready');
  }

  markError(err) {
    if (this._stopped) return;
    this.emit('error', err);
  }

  markReconnected() {
    if (this._stopped) return;
    this.emit('reconnected');
  }

  markReset() {
    if (this._stopped) return;
    this._ready = false;
    this.emit('reset');
  }

  markPaused() {
    if (this._stopped) return;
    this.emit('paused');
  }

  markResumed() {
    if (this._stopped) return;
    this.emit('resumed');
  }

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  isReady()   { return this._ready; }
  isStopped() { return this._stopped; }

  /**
   * Stop this ChangeStream. Emits 'stop', then removes all listeners.
   *
   * Ordering note: listeners attached AFTER stop() returns will not receive
   * the 'stop' event (it has already fired, and removeAllListeners has run).
   * Consumers that may race attach vs stop should check `isStopped()`
   * before relying on a 'stop' listener.
   */
  stop() {
    if (this._stopped) return;
    this._stopped = true;
    this.emit('stop');
    this.removeAllListeners();
  }
}
