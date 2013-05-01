// XXX namespacing
Meteor._RemoteCollectionDriver = function (mongo_url) {
  var self = this;
  self.mongo = new Meteor._Mongo(mongo_url);
};

_.extend(Meteor._RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    _.each(
      ['find', 'findOne', 'insert', 'update', 'remove', '_ensureIndex',
       '_dropIndex'],
      function (m) {
        ret[m] = _.bind(self.mongo[m], self.mongo, name);
      });
    return ret;
  }
});


// Create the singleton _RemoteCollectionDriver only on demand, so we
// only require Mongo configuration if it's actually used (eg, not if
// you're only trying to receive data from a remote DDP server.)
var theDriver = null;
Meteor._getRemoteCollectionDriver = function () {
  if (! theDriver) {
    // XXX kind of hacky
    var mongoUrl = Meteor._get(__meteor_bootstrap__.deployConfig,
                               'packages', 'mongo-livedata', 'url');
    // XXX bad error since it could also be set directly in METEOR_DEPLOY_CONFIG
    if (! mongoUrl)
      throw new Error("MONGO_URL must be set in environment");

    theDriver = new Meteor._RemoteCollectionDriver(mongoUrl);
  }

  return theDriver;
};
