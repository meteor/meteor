/**
 * @module thread-context/errors
 * @summary Error hierarchy and serialization for the thread-context bridge.
 */

/**
 * Base error class for all bridge-related failures.
 * @extends Error
 */
class BridgeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BridgeError';
  }
}

/**
 * Thrown when a proxied bridge call exceeds the configured `callTimeout`.
 * @extends BridgeError
 */
class BridgeTimeoutError extends BridgeError {
  constructor(message) {
    super(message);
    this.name = 'BridgeTimeoutError';
  }
}

/**
 * Thrown when a value cannot be serialized across the thread boundary
 * via structured clone (e.g. functions, Symbols, circular references).
 * @extends BridgeError
 */
class BridgeSerializationError extends BridgeError {
  constructor(message) {
    super(message);
    this.name = 'BridgeSerializationError';
  }
}

/**
 * Thrown when a forbidden context operation is attempted from a worker
 * (e.g. `setUserId()`, accessing `connection.clientAddress`).
 * @extends BridgeError
 */
class BridgeContextError extends BridgeError {
  constructor(message) {
    super(message);
    this.name = 'BridgeContextError';
  }
}

/**
 * Worker-side stand-in for `Meteor.Error`. Preserves the same fields
 * (`error`, `reason`, `details`, `isClientSafe`) so errors round-trip
 * through the bridge without losing identity.
 *
 * This is intentionally separate from the real `Meteor.Error` because
 * worker threads do not have access to Meteor's runtime.
 *
 * @extends Error
 */
class MeteorError extends Error {
  /**
   * @param {string|number} error - Machine-readable error code.
   * @param {string} [reason] - Human-readable summary.
   * @param {string} [details] - Additional detail string.
   */
  constructor(error, reason, details) {
    const message = reason ? `${reason} [${error}]` : `[${error}]`;
    super(message);
    this.name = 'Meteor.Error';
    /** @type {boolean} */
    this.isClientSafe = true;
    /** @type {string|number} */
    this.error = error;
    /** @type {string|undefined} */
    this.reason = reason;
    /** @type {string|undefined} */
    this.details = details;
  }
}

/** @type {Record<string, typeof BridgeError>} */
const BRIDGE_ERROR_CLASSES = {
  BridgeTimeoutError,
  BridgeSerializationError,
  BridgeContextError,
  BridgeError,
};

/**
 * Serializes an error into a structured-clone-safe plain object for
 * transmission over the MessageChannel. Detects `Meteor.Error` via
 * duck-typing (`isClientSafe` + own `error` + own `reason`) so it works for
 * both real `Meteor.Error` on the host and `MeteorError` in workers.
 *
 * @param {Error} err - The error to serialize.
 * @returns {{ type: string, message: string, stack?: string, meteorError?: string|number, reason?: string, details?: string }}
 */
function serializeError(err) {
  const has = Object.prototype.hasOwnProperty;
  if (err && err.isClientSafe && has.call(err, 'error') && has.call(err, 'reason')) {
    return {
      type: 'MeteorError',
      meteorError: err.error,
      reason: err.reason,
      details: err.details,
      message: err.message,
      stack: err.stack,
    };
  }

  if (err instanceof BridgeError) {
    return {
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return {
    type: 'BridgeError',
    message: (err && err.message) || String(err),
    stack: err && err.stack,
  };
}

/**
 * Reconstructs a typed error instance from a serialized plain object.
 * Used on the worker side to re-throw the correct error class.
 *
 * @param {{ type: string, message: string, stack?: string, meteorError?: string|number, reason?: string, details?: string }} obj
 * @returns {BridgeError|MeteorError}
 */
function deserializeError(obj) {
  if (obj.type === 'MeteorError') {
    const err = new MeteorError(obj.meteorError, obj.reason, obj.details);
    err.stack = obj.stack;
    return err;
  }

  const ErrorClass = BRIDGE_ERROR_CLASSES[obj.type] || BridgeError;
  const err = new ErrorClass(obj.message);
  err.stack = obj.stack;
  return err;
}

export {
  BridgeError,
  BridgeTimeoutError,
  BridgeSerializationError,
  BridgeContextError,
  MeteorError,
  serializeError,
  deserializeError,
};
