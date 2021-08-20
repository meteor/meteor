import { onceAsync } from './mongoAsyncUtils';

MongoInternals.RemoteCollectionDriver = async function (
  mongo_url, options) {
  var self = this;
  self.mongo = await new MongoConnection(mongo_url, options);
  return self;
};

Object.assign(MongoInternals.RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    ['find', 'findOne', 'insert', 'update', 'upsert',
      'remove', '_ensureIndex', 'createIndex', '_dropIndex', '_createCappedCollection',
      'dropCollection', 'rawCollection'].forEach(
      function (m) {
        ret[m] = _.bind(self.mongo[m], self.mongo, name);
      });
    return ret;
  }
});

// Create the singleton RemoteCollectionDriver only on demand, so we
// only require Mongo configuration if it's actually used (eg, not if
// you're only trying to receive data from a remote DDP server.)
MongoInternals.defaultRemoteCollectionDriver = onceAsync(async function () {
  var connectionOptions = {};

  var mongoUrl = process.env.MONGO_URL;

  if (process.env.MONGO_OPLOG_URL) {
    connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;
  }

  if (! mongoUrl)
    throw new Error("MONGO_URL must be set in environment");

  return await new MongoInternals.RemoteCollectionDriver(mongoUrl, connectionOptions);
});
