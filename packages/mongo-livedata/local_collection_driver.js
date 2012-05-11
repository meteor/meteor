// XXX namespacing
Meteor._LocalCollectionDriver = function () {
  var self = this;
  self.collections = {};
};

_.extend(Meteor._LocalCollectionDriver.prototype, {
  open: function (name, ctor) {
    var self = this;
    if (!name)
      return new LocalCollection(ctor);
    if (!(name in self.collections))
      self.collections[name] = new LocalCollection(ctor);
    return self.collections[name];
  }
});

// singleton
Meteor._LocalCollectionDriver = new Meteor._LocalCollectionDriver;
