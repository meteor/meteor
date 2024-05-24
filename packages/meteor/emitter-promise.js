const { EventEmitter } = Npm.require('events');

const DEFAULT_TIMEOUT =
  Meteor.settings && Meteor.settings.EMITTER_PROMISE_DEFAULT_TIMEOUT || 3000;

/**
 *
 * @param emitter { EventEmitter } - EventEmitter used to trigger events emitter.emit("data", OBJ) or emitter.emit("error", ERROR_OBJ).
 * @param timeout { Number } - Timout em ms to wait for events. Default 3000ms.
 * @param onSuccess {function(data)} - Function called on succeceful receive data.
 * @param onError {function(err)} - Function called when error or timeout occur.
 * @returns {{promise: Promise<unknown>, emitter: EventEmitter}}
 */
const newPromiseResolver = ({
  emitter = new EventEmitter(),
  timeout = DEFAULT_TIMEOUT,
  onSuccess,
  onError,
} = {}) => {
  const promise = new Promise((resolve, reject) => {
    const handler = setTimeout(() => {
      emitter.emit(
        'error',
        new Meteor.Error(`EmitterPromise timeout: ${timeout}ms.`)
      );
    }, timeout);
    emitter.once('data', (data) => {
      clearTimeout(handler);
      emitter.removeAllListeners();
      resolve(data);
      if (onSuccess) {
        onSuccess(data);
      }
    });
    emitter.once('error', (err) => {
      clearTimeout(handler);
      emitter.removeAllListeners();
      reject(err);
      if (onError) {
        onError(err);
      }
    });
  });
  return {
    emitter,
    promise,
  };
};

EmitterPromise = {
  newPromiseResolver,
};
