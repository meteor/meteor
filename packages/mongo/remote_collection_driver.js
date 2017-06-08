var fs = require('fs');

MongoInternals.RemoteCollectionDriver = function (
  mongo_url, options) {
  var self = this;
  self.mongo = new MongoConnection(mongo_url, options);
};

_.extend(MongoInternals.RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    _.each(
      ['find', 'findOne', 'insert', 'update', 'upsert',
       'remove', '_ensureIndex', '_dropIndex', '_createCappedCollection',
       'dropCollection', 'rawCollection'],
      function (m) {
        ret[m] = _.bind(self.mongo[m], self.mongo, name);
      });
    return ret;
  }
});


// Create the singleton RemoteCollectionDriver only on demand, so we
// only require Mongo configuration if it's actually used (eg, not if
// you're only trying to receive data from a remote DDP server.)
MongoInternals.defaultRemoteCollectionDriver = _.once(function () {
  var connectionOptions = {};

  var mongoUrl = process.env.MONGO_URL;

  if (process.env.MONGO_OPLOG_URL) {
    connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;
  }

  if (process.env.MONGO_SSL_VALIDATE) {
    connectionOptions.sslValidate = process.env.MONGO_SSL_VALIDATE;
  }

  if (process.env.MONGO_SSL_KEY_PATH) {
    connectionOptions.sslKey = fs.readFileSync(process.env.MONGO_SSL_KEY_PATH);
  }

  if (process.env.MONGO_SSL_CERT_PATH) {
    connectionOptions.sslCert = fs.readFileSync(process.env.MONGO_SSL_CERT_PATH);
  }

  if (process.env.MONGO_SSL_CA_PATH) {
    connectionOptions.sslCa = fs.readFileSync(process.env.MONGO_SSL_CA_PATH);
  }

  if (! mongoUrl)
    throw new Error("MONGO_URL must be set in environment");

  return new MongoInternals.RemoteCollectionDriver(mongoUrl, connectionOptions);
});
