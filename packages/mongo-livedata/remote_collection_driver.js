// XXX namespacing
Meteor._RemoteCollectionDriver = function (mongo_url) {
  var self = this;
  self.mongo = new Meteor._Mongo(mongo_url);
};

_.extend(Meteor._RemoteCollectionDriver.prototype, {
  open: function (name, ctor) {
    var self = this;
    var ret = {};
    _.each(['find', 'findOne', 'insert', 'update', 'remove'], function (m) {
      ret[m] = _.bind(self.mongo[m], self.mongo, name, ctor);
    });
    return ret;
  }
});

// singleton
// XXX kind of hacky
Meteor._RemoteCollectionDriver = new Meteor._RemoteCollectionDriver(__meteor_bootstrap__.mongo_url);
