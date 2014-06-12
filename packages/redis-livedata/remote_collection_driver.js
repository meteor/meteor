RedisInternals.RemoteCollectionDriver = function (
  url, options) {
  var self = this;
  self.connection = new RedisConnection(url, options);
};

_.extend(RedisInternals.RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    _.each(
      ['find', 'findOne', 'insert', 'update', , 'upsert',
       'remove', '_ensureIndex', '_dropIndex', '_createCappedCollection',
       'dropCollection'],
      function (m) {
        ret[m] = _.bind(self.connection[m], self.connection, name);
      });
    _.each(
        ['keys', 'hgetall', 'hmset', 'hincrby', 'observe', 'del'],
        function (m) {
          ret[m] = _.bind(self.connection[m], self.connection);
        });
    return ret;
  }
});


// Create the singleton RemoteCollectionDriver only on demand, so we
// only require Mongo configuration if it's actually used (eg, not if
// you're only trying to receive data from a remote DDP server.)
RedisInternals.defaultRemoteCollectionDriver = _.once(function () {
  var redisUrl;
  var connectionOptions = {};

  AppConfig.configurePackage("redis-livedata", function (config) {
    // This will keep running if redis gets reconfigured.  That's not ideal, but
    // should be ok for now.
    redisUrl = config.url;

    if (config.oplog)
      connectionOptions.oplogUrl = config.oplog;
  });

  // XXX bad error since it could also be set directly in METEOR_DEPLOY_CONFIG
  if (! redisUrl)
    throw new Error("REDIS_URL must be set in environment");


  return new RedisInternals.RemoteCollectionDriver(redisUrl, connectionOptions);
});
