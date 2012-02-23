// XXX namespacing
Meteor._LocalCollectionDriver = function () {
  var self = this;
  self.collections = {};
};

_.extend(Meteor._LocalCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    if (!name)
      return new LocalCollection;
    if (!(name in self.collections))
      self.collections[name] = new LocalCollection;
    return self.collections[name];
  }
});

// singleton
Meteor._LocalCollectionDriver = new Meteor._LocalCollectionDriver;
