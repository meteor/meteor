// XXX namespacing
Meteor._RemoteStoreDriver = function (redis_url) {
  var self = this;
  _Redis.setClient(redis_url);
  self.stores = {};
};

_.extend(Meteor._RemoteStoreDriver.prototype, {
  open: function (name,type) {
    var self = this;
    if (!name)
      return new _RedisHash;
    if (!(name in self.stores)) {
      var cls = {
        'string': _RedisString,
        'hash': _RedisHash,
        'set': _RedisSet
      }[type];
      self.stores[name] = new cls(name);
    }
    return self.stores[name];
  }
});

// singleton
// XXX kind of hacky
Meteor._RemoteStoreDriver = new Meteor._RemoteStoreDriver(__meteor_bootstrap__.redis_url);
