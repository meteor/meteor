class BridgeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BridgeError';
  }
}

class BridgeTimeoutError extends BridgeError {
  constructor(message) {
    super(message);
    this.name = 'BridgeTimeoutError';
  }
}

class BridgeAccessError extends BridgeError {
  constructor(message) {
    super(message);
    this.name = 'BridgeAccessError';
  }
}

class BridgeSerializationError extends BridgeError {
  constructor(message) {
    super(message);
    this.name = 'BridgeSerializationError';
  }
}

class BridgeContextError extends BridgeError {
  constructor(message) {
    super(message);
    this.name = 'BridgeContextError';
  }
}

class MeteorError extends Error {
  constructor(error, reason, details) {
    const message = reason ? `${reason} [${error}]` : `[${error}]`;
    super(message);
    this.name = 'Meteor.Error';
    this.isClientSafe = true;
    this.error = error;
    this.reason = reason;
    this.details = details;
  }
}

const BRIDGE_ERROR_CLASSES = {
  BridgeTimeoutError,
  BridgeAccessError,
  BridgeSerializationError,
  BridgeContextError,
  BridgeError,
};

function serializeError(err) {
  if (err && err.isClientSafe && err.error !== undefined && err.reason !== undefined) {
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
    message: err.message || String(err),
    stack: err.stack,
  };
}

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
  BridgeAccessError,
  BridgeSerializationError,
  BridgeContextError,
  MeteorError,
  serializeError,
  deserializeError,
};
