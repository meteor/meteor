import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

// Same convention as accounts-password: a string is an email when it contains
// an "@", otherwise a username. Objects pass through unchanged.
export const transformSelector = selector => {
  if (selector == null) {
    return undefined;
  }
  if (typeof selector !== 'string') {
    return selector;
  }
  return selector.includes('@') ? { email: selector } : { username: selector };
};

// Promise-returning method call on the accounts connection.
export const callMethod = Meteor.promisify(
  Accounts.connection.call,
  Accounts.connection
);

// Wraps a promise-returning implementation as a function that accepts an
// optional Node-style callback as its last argument. Without a callback,
// failures are logged: an asynchronous ceremony has no caller left to throw
// to.
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
