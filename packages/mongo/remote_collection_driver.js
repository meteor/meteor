import once from 'lodash.once';
import {
  ASYNC_COLLECTION_METHODS,
  getAsyncMethodName,
  CLIENT_ONLY_METHODS
} from "meteor/minimongo/constants";

MongoInternals.RemoteCollectionDriver = function (
  mongo_url, options) {
  var self = this;
  self.mongo = new MongoConnection(mongo_url, options);
};

const REMOTE_COLLECTION_METHODS = [
  'createCappedCollectionAsync',
  'dropIndexAsync',
  'ensureIndexAsync',
  'createIndexAsync',
  'countDocuments',
  'dropCollectionAsync',
  'estimatedDocumentCount',
  'find',
  'findOneAsync',
  'insertAsync',
  'rawCollection',
  'removeAsync',
  'updateAsync',
  'upsertAsync',
];

Object.assign(MongoInternals.RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    REMOTE_COLLECTION_METHODS.forEach(function (m) {
      ret[m] = self.mongo[m].bind(self.mongo, name);

      if (!ASYNC_COLLECTION_METHODS.includes(m)) return;
      const asyncMethodName = getAsyncMethodName(m);
      ret[asyncMethodName] = function (...args) {
        try {
          return Promise.resolve(ret[m](...args));
        } catch (error) {
          return Promise.reject(error);
        }
      };
    });

    CLIENT_ONLY_METHODS.forEach(function (m) {
      ret[m] = function (...args) {
        throw new Error(
          `${m} is not available on the server. Please use ${getAsyncMethodName(
            m
          )}() instead.`
        );
      };
    });
    return ret;
  },
});


// Create the singleton RemoteCollectionDriver only on demand, so we
// only require Mongo configuration if it's actually used (eg, not if
// you're only trying to receive data from a remote DDP server.)
MongoInternals.defaultRemoteCollectionDriver = once(function () {
  var connectionOptions = {};

  var mongoUrl = process.env.MONGO_URL;

  if (process.env.MONGO_OPLOG_URL) {
    connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;
  }

  if (! mongoUrl)
    throw new Error("MONGO_URL must be set in environment");

  const driver = new MongoInternals.RemoteCollectionDriver(mongoUrl, connectionOptions);
  // As many deployment tools, including Meteor Up, send requests to the app in
  // order to confirm that the deployment finished successfully, it's required
  // to know about a database connection problem before the app starts. Doing so
  // in a `Meteor.startup` is fine, as the `WebApp` handles requests only after
  // all are finished.
  Meteor.startup(async () => {
    await driver.mongo.client.connect();
  });

  return driver;
});
