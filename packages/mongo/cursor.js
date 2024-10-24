// CURSORS

// There are several classes which relate to cursors:
//
// CursorDescription represents the arguments used to construct a cursor:
// collectionName, selector, and (find) options.  Because it is used as a key
// for cursor de-dup, everything in it should either be JSON-stringifiable or
// not affect observeChanges output (eg, options.transform functions are not
// stringifiable but do not affect observeChanges).
//
// SynchronousCursor is a wrapper around a MongoDB cursor
// which includes fully-synchronous versions of forEach, etc.
//
// Cursor is the cursor object returned from find(), which implements the
// documented Mongo.Collection cursor API.  It wraps a CursorDescription and a
// SynchronousCursor (lazily: it doesn't contact Mongo until you call a method
// like fetch or forEach on it).
//
// ObserveHandle is the "observe handle" returned from observeChanges. It has a
// reference to an ObserveMultiplexer.
//
// ObserveMultiplexer allows multiple identical ObserveHandles to be driven by a
// single observe driver.
//
// There are two "observe drivers" which drive ObserveMultiplexers:
//   - PollingObserveDriver caches the results of a query and reruns it when
//     necessary.
//   - OplogObserveDriver follows the Mongo operation log to directly observe
//     database changes.
// Both implementations follow the same simple interface: when you create them,
// they start sending observeChanges callbacks (and a ready() invocation) to
// their ObserveMultiplexer, and you stop them by calling their stop() method.

import { ASYNC_CURSOR_METHODS, getAsyncMethodName } from 'meteor/minimongo/constants';
import { replaceMeteorAtomWithMongo, replaceTypes } from './mongo_common';
import LocalCollection from 'meteor/minimongo/local_collection';

export const Cursor = function (mongo, cursorDescription) {
  var self = this;

  self._mongo = mongo;
  self._cursorDescription = cursorDescription;
  self._synchronousCursor = null;
};

Cursor.prototype.countAsync = async function () {
  const collection = this._mongo.rawCollection(this._cursorDescription.collectionName);
  return await collection.countDocuments(
    replaceTypes(this._cursorDescription.selector, replaceMeteorAtomWithMongo),
    replaceTypes(this._cursorDescription.options, replaceMeteorAtomWithMongo),
  );
};

Cursor.prototype.count = function () {
  throw new Error(
    "count() is not available on the server. Please use countAsync() instead."
  );
};

[...ASYNC_CURSOR_METHODS, Symbol.iterator, Symbol.asyncIterator].forEach(methodName => {
  // count is handled specially since we don't want to create a cursor.
  // it is still included in ASYNC_CURSOR_METHODS because we still want an async version of it to exist.
  if (methodName === 'count') {
    return
  }
  Cursor.prototype[methodName] = function (...args) {
    const cursor = setupAsynchronousCursor(this, methodName);
    return cursor[methodName](...args);
  };

  // These methods are handled separately.
  if (methodName === Symbol.iterator || methodName === Symbol.asyncIterator) {
    return;
  }

  const methodNameAsync = getAsyncMethodName(methodName);
  Cursor.prototype[methodNameAsync] = function (...args) {
    try {
      return Promise.resolve(this[methodName](...args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
});

Cursor.prototype.getTransform = function () {
  return this._cursorDescription.options.transform;
};

// When you call Meteor.publish() with a function that returns a Cursor, we need
// to transmute it into the equivalent subscription.  This is the function that
// does that.
Cursor.prototype._publishCursor = function (sub) {
  var self = this;
  var collection = self._cursorDescription.collectionName;
  return Mongo.Collection._publishCursor(self, sub, collection);
};

// Used to guarantee that publish functions return at most one cursor per
// collection. Private, because we might later have cursors that include
// documents from multiple collections somehow.
Cursor.prototype._getCollectionName = function () {
  var self = this;
  return self._cursorDescription.collectionName;
};

Cursor.prototype.observe = function (callbacks) {
  var self = this;
  return LocalCollection._observeFromObserveChanges(self, callbacks);
};

Cursor.prototype.observeAsync = function (callbacks) {
  return new Promise(resolve => resolve(this.observe(callbacks)));
};

Cursor.prototype.observeChanges = function (callbacks, options = {}) {
  var self = this;

  var ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);

  return self._mongo._observeChanges(
    self._cursorDescription, ordered, callbacks, options.nonMutatingCallbacks);
};

Cursor.prototype.observeChangesAsync = async function (callbacks, options = {}) {
  return this.observeChanges(callbacks, options);
};

function setupAsynchronousCursor(cursor, method) {
  // You can only observe a tailable cursor.
  if (cursor._cursorDescription.options.tailable)
    throw new Error('Cannot call ' + method + ' on a tailable cursor');

  if (!cursor._synchronousCursor) {
    cursor._synchronousCursor = cursor._mongo._createAsynchronousCursor(
      cursor._cursorDescription,
      {
        // Make sure that the "cursor" argument to forEach/map callbacks is the
        // Cursor, not the SynchronousCursor.
        selfForIteration: cursor,
        useTransform: true,
      }
    );
  }

  return cursor._synchronousCursor;
}