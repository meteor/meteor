// exported symbol
Miniredis = {};

var throwNotImplementedError = function () {
  throw new Error("The called method is not available in miniredis implementation");
};

var throwIncorrectKindOfValueError = function () {
  // XXX should be a special type of error "WRONGTYPE"
  throw new Error("Operation against a key holding the wrong kind of value");
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

  // -----
  // general operators on keys
  // -----

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
  exists: function (key) {
    var self = this;
    if (self._kv.has(key))
      return 1;
    return 0;
  },
  keys: function (pattern) {
    var self = this;
    var regexp = patternToRegexp(pattern);

    return _.filter(_.keys(self._kv), function (key) {
      return key.match(regexp);
    });
  },
  randomkey: function () {
    var self = this;
    return Random.choice(_.keys(self._kv));
  },
  rename: function (key, newkey) {
    if (key === newkey)
      throw new Error("Source and destination objects are the same");

    var self = this;

    if (! self._kv.has(key))
      throw new Error("No such key");

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
  sort: function () {
    // This is a non-trivial operator that requires more thought on the design
    // and implementation. We probably want to implement this as it is the only
    // querying mechanism.
    throwNotImplementedError();
  },
  type: function (key) {
    var self = this;

    // for unset keys the return value is "none"
    if (! self._kv.has(key))
      return "none";

    var val = self._kv.get(key);
    if (_.isString(val))
      return "string";
    return val.type();
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
  },

  // -----
  // operators on strings
  // -----

  append: function (key, value) {
    var self = this;
    var val = self._kv.has(key) ? self._kv.get(key) : "";

    if (! _.isString(val))
      throwIncorrectKindOfValueError();

    val += value;
    self._kv.set(key, val);

    return val.length;
  },
  decr: function (key) {
    var self = this;
    self.decrby(key, 1);
  },
  decrby: function (key, decrement) {
    var self = this;
    var val = self._kv.has(key) ? self._kv.get(key) : 0;

    if (! _.isString(val))
      throwIncorrectKindOfValueError();

    // cast to integer
    var newVal = val |0;

    if (val !== newVal.toString())
      throw new Error("Value is not an integer or out of range");

    self._kv.set(key, (newVal - decrement).toString());
  },
  get: function (key) {
    var self = this;
    var val = self._kv.has(key) ? self._kv.get(key) : null;
    if (val !== null && ! _.isString(val))
      throwIncorrectKindOfValueError();
    // XXX shouldn't clone, strings are immutable
    return EJSON.clone(val);
  },
  getrange: function (key, start, end) {
    start = start || 0;
    end = end || 0;

    var self = this;
    var val = self._kv.has(key) ? self._kv.get(key) : "";

    if (! _.isString(val))
      throwIncorrectKindOfValueError();
    if (val === "")
      return "";

    var len = val.length;
    var normalizedBounds = normalizeBounds(start, end, len);
    start = normalizeBounds.start;
    end = normalizeBounds.end;

    if (end < start)
      return "";

    return val.substr(start, end - start + 1);
  },
  getset: function (key, value) {
    var self = this;
    var val = self.get(key);
    self.set(key, value);
    return val;
  },
  incr: function (key) {
    var self = this;
    self.incrby(key, 1);
  },
  incrby: function (key, increment) {
    var self = this;
    self.decrby(key, -increment);
  },
  incrbyfloat: function (key, increment) {
    var self = this;
    var val = self._kv.has(key) ? self._kv.get(key) : 0;

    if (! _.isString(val))
      throwIncorrectKindOfValueError();

    // cast to integer
    var newVal = parseFloat(val);

    if (isNaN(newVal))
      throw new Error("Value is not a valid float");

    self._kv.set(key, (newVal + increment).toString());
  },
  mget: function (/* args */) {
    var self = this;
    return _.map(arguments, function (key) {
      return self.get(key);
    });
  },
  mset: function (/* args */) {
    var self = this;
    for (var i = 0; i < arguments.length; i += 2) {
      var key = arguments[i];
      var value = arguments[i + 1];
      self.set(key, value);
    }
  },
  msetnx: function (/* args */) {
    var self = this;
    if (_.all(arguments, function (key, i) {
      return (i % 2 === 1) || self._kv.has(key);
    })) {
      self.mset.apply(self, arguments);
      return 1;
    }

    return 0;
  },
  set: function (key, value) {
    var self = this;
    // XXX instead of EJSON.cloning we should probably check for the type and
    // not bother cloning as strings are immutable
    self._kv.set(key, EJSON.clone(value));
  },
  setnx: function (key, value) {
    var self = this;
    if (self._kv.has(key))
      return 0;
    self.set(key, value);
    return 1;
  },
  setrange: function (key, offset, value) {
    // We probably should have an implementation for this one but it requires a
    // bit more thinking on how do we zero pad the string.
    throwNotImplementedError();
  },
  strlen: function (key) {
    var self = this;
    var val = self.get(key);
    return val ? val.length : 0;
  }
});

Miniredis.unsupportedMethods = ["ttl", "restore", "dump", "expire", "expireat",
  "migrate", "move", "object", "persist", "pexpire", "pexpireat", "pttl",
  "bitcount", "bitop", "bitops", "getbit", "setbit", "setex", "psetex",
  "blpop", "brpop", "brpoplpush", "rpoplpush"];

_.each(Miniredis.unsupportedMethods, function (method) {
  Miniredis.RedisStore.prototype[method] = throwNotImplementedError;
});

Miniredis.List = function () {
  this._list = [];
};

_.extend(Miniredis.List.prototype, {
  // since the Miniredis.List will always be used through RedisStore, there
  // is no point of extra type-checking
  lpush: function (value) {
    this._list.splice(0, 0, value);
    return this._list.length;
  },
  rpush: function (value) {
    this._list.push(value);
    return this._list.length;
  },
  lpop: function () {
    var val = this._list.splice(0, 1)[0];
    return val === undefined ? null : val;
  },
  rpop: function () {
    var val = this._list.pop();
    return val === undefined ? null : val;
  },
  lindex: function (index) {
    if (index < 0)
      index = this._list.length + index;
    var val = this._list[index];
    return val === undefined ? null : val;
  },
  linsert: function (isBefore, pivot, value) {
    var self = this;
    var pos = _.indexOf(self._list, pivot);

    if (pos === -1)
      return -1;

    self._list.splice(isBefore ? pos : pos + 1, 0, value);
    return self._list.length;
  },
  lrange: function (start, stop) {
    var self = this;
    var normalizedBounds = normalizeBounds(start, stop, self._list.length);
    start = normalizedBounds.start;
    stop = normalizedBounds.end;

    if (start > stop)
      return [];

    return self._list.slice(start, stop - start + 1);
  },
  lset: function (index, value) {
    if (index < 0)
      index = this._length + index;
    this._list[index] = value;
  },
  ltrim: function (start, stop) {
    this._list = this.lrange(start, stop);
  },
  type: function () { return "list"; }
});

_.each(["lpushx", "rpushx"], function (method) {
  Miniredis.RedisStore.prototype[method] = function (key/* args */) {
    var self = this;

    if (! self._kv.has(key))
      return 0;
    return self[method.slice(0, -1)].apply(arguments);
  };
});

_.each(["lpush", "rpus", "lpop", "rpop", "lindex", "linsert", "lrange",
        "lset", "ltrim"],
       function (method) {
         Miniredis.RedisStore.prototype[method] = function (key/*, args */) {
           var self = this;
           var args = _.toArray(arguments).slice(1);

           if (! self._kv.has(key))
             self._kv.set(key, new Miniredis.List);

           var list = self._kv.get(key);
           if (! (list instanceof Miniredis.List))
             throwIncorrectKindOfValueError();

           return Miniredis.List[method].apply(list, args);
         };
       });

function normalizeBounds (start, end, len) {
  // put start and end into [0, len) range
  start %= len;
  if (start < 0)
    start += len;
  end %= len;
  if (end < 0)
    end += len;
  if (end >= len)
    end = len - 1;
  return { start: start, end: end };
}

function patternToRegexp (pattern) {
  // all special chars except for [, ], *, ?
  // - as they are used as is in patterns
  var specialChars = ".\\^$()+{}";
  var regexpStr = "^";

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

  regexpStr += "$";

  return new RegExp(regexpStr);
}

// Test-only export
MiniredisTest = {
  patternToRegexp: patternToRegexp
};

