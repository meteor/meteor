IdMap = function () {
  var self = this;
  self.map = {};
};

_.extend(IdMap.prototype, {
  get: function (id) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    return self.map[key];
  },
  set: function (id, value) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    self.map[key] = value;
  },
  remove: function(id) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    delete self.map[key];
  },
  has: function(id) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    return _.has(self.map, key);
  }
});
