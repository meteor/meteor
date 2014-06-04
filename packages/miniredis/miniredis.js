// exported symbol
Miniredis = {};

var throwNotImplementedError = function () {
  throw new Error("The called method is not available in miniredis implementation.");
};

// A main store class
Miniredis.RedisStore = function () {
  var self = this;

  // main key-value storage
  self._kv = new IdMap(EJSON.stringify, EJSON.parse);
};

_.extend(Miniredis.RedisStore.prototype, {
  call: function (method/*, args */) {
    var self = this;
    var args = _.toArray(arguments).slice(1);

    return self[method.toLowerCase()].apply(self, args);
  },
  del: function (/* args */) {
    var self = this;
    var removedCount = 0;
    _.each(arguments, function (key) {
      if (self._kv.has(key)) {
        removedCount++;
        self._kv.remove(key);
      }
    });

    return removedCount;
  },
  dump: function () { throwNotImplementedError(); },
  exists: function (key) {
    var self = this;
    if (self._kv.has(key))
      return 1;
    return 0;
  },
  expire: function () { throwNotImplementedError(); },
  expireat: function () { throwNotImplementedError(); },
  keys: function (pattern) {
    var self = this;
    var regexp = patternToRegexp(pattern);

    return _.filter(_.keys(self._kv), function (key) {
      return key.match(regexp);
    });
  },
  migrate: function () { throwNotImplementedError(); },
  move: function () { throwNotImplementedError(); },
  object: function () { throwNotImplementedError(); },
  persist: function () { throwNotImplementedError(); },
  pexpire: function () { throwNotImplementedError(); },
  pexpireat: function () { throwNotImplementedError(); },
  pttl: function () { throwNotImplementedError(); },
  randomkey: function () {
    var self = this;
    return Random.choice(_.keys(self._kv));
  },
  rename: function (key, newkey) {
    if (key === newkey)
      throw new Error("source and destination objects are the same");

    var self = this;

    if (! self._kv.has(key))
      throw new Error("no such key");

    var val = self._kv.get(key);
    self._kv.remove(key);
    self._kv.set(newkey, val);
  },
  renamenx: function (key, newkey) {
    var self = this;

    if (self._kv.has(newkey))
      return 0;

    self.rename(key, newkey);
    return 1;
  },
  restore: function () { throwNotImplementedError(); },
  sort: function () {
    // This is a non-trivial operator that requires more thought on the design
    // and implementation. We probably want to implement this as it is the only
    // querying mechanism.
    throwNotImplementedError();
  },
  ttl: function () { throwNotImplementedError(); },
  type: function (key) {
    var self = this;

    // for unset keys the return value is "none"
    if (! self._kv.has(key))
      return "none";

    return self._kv.get(key).type();
  },
  // implemented as an iterator similar to _.each
  // the original docs of redis describe a different low-level semantics
  // http://redis.io/commands/scan
  //
  // options:
  //  - count - defaults to 10
  //  - pattern - defaults to no pattern
  // iterator:
  //   is called with value and key as arguments
  //   stops iteration if the return value is false
  scan: function (options, iterator) {
    var self = this;
    var count = options.count;
    if (count === undefined) count = 10;
    var regexp = options.pattern && patternToRegexp(options.pattern);

    self._kv.forEach(function (value, key) {
      // break if we called enough times
      if (! count)
        return false;

      if (regexp && ! key.match(regexp))
        return;

      count--;
      var returnValue = iterator(value, key);
      if (returnValue === false)
        return false;
    });
  }
});

function patternToRegexp (pattern) {
  // all special chars except for [, ], *, ?
  // - as they are used as is in patterns
  var specialChars = ".\\^$()+{}";
  var regexpStr = "";

  _.each(pattern, function (ch) {
    if (_.contains(specialChars, ch))
      regexpStr += "\\";

    // "match one" operator
    if (ch === "?")
      ch = ".";
    // "match any number of chars" operator
    if (ch === "*")
      ch = ".*";

    regexpStr += ch;
  });

  return new RegExp(regexpStr);
}

