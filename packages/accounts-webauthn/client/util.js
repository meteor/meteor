import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

/**
 * Turns a string selector into a query, with the accounts-password
 * convention: a string is an email when it contains an "@", otherwise a
 * username. Objects pass through unchanged.
 * @param {Object|String} [selector]
 * @returns {Object|undefined}
 */
export const transformSelector = selector => {
  if (selector == null) {
    return undefined;
  }
  if (typeof selector !== 'string') {
    return selector;
  }
  return selector.includes('@') ? { email: selector } : { username: selector };
};

/**
 * Promise-returning method call on the accounts connection.
 * @param {String} name The method name.
 * @param {...*} args The method arguments.
 * @returns {Promise<*>}
 */
export const callMethod = (name, ...args) =>
  Accounts.connection.callAsync(name, ...args);

/**
 * Wraps a promise-returning implementation as a function that accepts an
 * optional Node-style callback as its last argument. Without a callback,
 * failures are logged: an asynchronous ceremony has no caller left to throw
 * to.
 * @param {Function} impl The promise-returning implementation.
 * @returns {Function} The callback-accepting wrapper.
 */
export const withCallback = impl => (...args) => {
  const callback = typeof args.at(-1) === 'function' ? args.pop() : undefined;
  impl(...args).then(
    result => {
      if (callback) {
        callback(undefined, result);
      }
    },
    error => {
      if (callback) {
        callback(error);
      } else {
        Meteor._debug('accounts-webauthn: unhandled error', error);
      }
    }
  );
};
