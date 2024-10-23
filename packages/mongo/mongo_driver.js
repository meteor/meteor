import { OplogHandle } from './oplog_tailing';
import { MongoConnection } from './mongo_connection';
import { OplogObserveDriver } from './oplog_observe_driver';
import { MongoDB } from './mongo_common';

MongoInternals = global.MongoInternals = {};

MongoInternals.__packageName = 'mongo';

MongoInternals.NpmModules = {
  mongodb: {
    version: NpmModuleMongodbVersion,
    module: MongoDB
  }
};

// Older version of what is now available via
// MongoInternals.NpmModules.mongodb.module.  It was never documented, but
// people do use it.
// XXX COMPAT WITH 1.0.3.2
MongoInternals.NpmModule = MongoDB;

MongoInternals.OplogHandle = OplogHandle;

MongoInternals.Connection = MongoConnection;

MongoInternals.OplogObserveDriver = OplogObserveDriver;

// This is used to add or remove EJSON from the beginning of everything nested
// inside an EJSON custom type. It should only be called on pure JSON!


// Ensure that EJSON.clone keeps a Timestamp as a Timestamp (instead of just
// doing a structural clone).
// XXX how ok is this? what if there are multiple copies of MongoDB loaded?
MongoDB.Timestamp.prototype.clone = function () {
  // Timestamps should be immutable.
  return this;
};

// Listen for the invalidation messages that will trigger us to poll the
// database for changes. If this selector specifies specific IDs, specify them
// here, so that updates to different specific IDs don't cause us to poll.
// listenCallback is the same kind of (notification, complete) callback passed
// to InvalidationCrossbar.listen.

export const listenAll = async function (cursorDescription, listenCallback) {
  const listeners = [];
  await forEachTrigger(cursorDescription, function (trigger) {
    listeners.push(DDPServer._InvalidationCrossbar.listen(
      trigger, listenCallback));
  });

  return {
    stop: function () {
      listeners.forEach(function (listener) {
        listener.stop();
      });
    }
  };
};

export const forEachTrigger = async function (cursorDescription, triggerCallback) {
  const key = {collection: cursorDescription.collectionName};
  const specificIds = LocalCollection._idsMatchedBySelector(
    cursorDescription.selector);
  if (specificIds) {
    for (const id of specificIds) {
      await triggerCallback(_.extend({id: id}, key));
    }
    await triggerCallback(_.extend({dropCollection: true, id: null}, key));
  } else {
    await triggerCallback(key);
  }
  // Everyone cares about the database being dropped.
  await triggerCallback({ dropDatabase: true });
};



// XXX We probably need to find a better way to expose this. Right now
// it's only used by tests, but in fact you need it in normal
// operation to interact with capped collections.
MongoInternals.MongoTimestamp = MongoDB.Timestamp;
