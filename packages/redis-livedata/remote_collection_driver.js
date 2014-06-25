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
        ret[m] = function () {
          throw new Error(m + ' is not available on REDIS! XXX');
        };
      });
      _.each(['keys', 'matching', 'get',
              'set', 'setex', 'append', 'del',
              'incr', 'incrby', 'incrbyfloat', 'decr', 'decrby',
              'hgetall', 'hmset', 'hincrby', '_keys_hgetall', '_observe', 'flushall'],
        function (m) {
          ret[m] = function (/* args */) {
            var args = _.toArray(arguments);
            var cb = args.pop();

            if (_.isFunction(cb)) {
              args.push(function (err, res) {
                // In Meteor the first argument (error) passed to the
                // callback is undefined if no error occurred.
                if (err === null) err = undefined;
                cb(err, res);
              });
            } else {
              args.push(cb);
            }

            return self.connection[m].apply(self.connection, args);
          };
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
