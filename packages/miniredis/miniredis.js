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
  // fine-grained reactivity per key
  self._keyDependencies = {};
  // fine-grained reactivity per non-trivial pattern
  self._patternDependencies = {};
};

// A hacky thing to declare an absence of value
var NON_EXISTANT = "___non_existant___" + Math.random();
_.extend(Miniredis.RedisStore.prototype, {
  // -----
  // convinience wrappers
  // -----
  _keyDep: function (key) {
    var self = this;

    // return a dummy if it is not going to be used anyway
    if (! Deps.active)
      return { depend: function () {}, changed: function () {} };

    if (! self._keyDependencies[key])
      self._keyDependencies[key] = new Deps.Dependency()

    // for future clean-up
    Deps.onInvalidate(function () {
      if (! self._keyDependencies[key])
        return;

      if (! self._keyDependencies[key].hasDependents())
        delete self._keyDependencies[key];
    });

    return self._keyDependencies[key];
  },
  _has: function (key) {
    var self = this;
    self._keyDep(key).depend();
    return self._kv.has(key);
  },
  _get: function (key) {
    var self = this;
    self._keyDep(key).depend();
    return self._kv.get(key);
  },
  _set: function (key, value) {
    var self = this;
    var oldValue = self._kv.has(key) ? self._kv.get(key) : NON_EXISTANT;
    self._kv.set(key, value);

    if (! self._keyDependencies[key])
      self._keyDependencies[key] = new Deps.Dependency();
    if (oldValue !== value)
      self._keyDependencies[key].changed();
    if (oldValue === NON_EXISTANT) {
      _.each(self._patternDependencies, function (dep, pattern) {
        if (key.match(patternToRegexp(pattern))) {
          dep.changed();
        }
      });
    }
  },

  _remove: function (key) {
    var self = this;
    if (! self._kv.has(key))
      return;
    self._kv.remove(key);
    self._keyDependencies[key].changed();

    if (self._keyDependencies[key] && ! self._keyDependencies[key].hasDependents())
      delete self._keyDependencies[key];
  },

  // -----
  // main interface built on top of Redis
  // -----

  call: function (method/*, args */) {
    var self = this;
    var args = _.toArray(arguments).slice(1);

    return self[method.toLowerCase()].apply(self, args);
  },

  patternFetch: function (pattern) {
    var self = this;
    var res = [];

    self._kv.forEach(function (value, key) {
      if (! key.match(patternToRegexp(pattern)))
        return;
      self._keyDep(key).depend();

      if (_.isString(value))
        res.push(value);
      else
        res.push(value.toArray());
    });

    if (! self._patternDependencies[pattern])
      self._patternDependencies[pattern] = new Deps.Dependency();
    self._patternDependencies[pattern].depend();

    Deps.onInvalidate(function (c) {
      if (c.stopped)
        delete self._patternDependencies[pattern];
    });

    return res;
  },

  // -----
  // general operators on keys
  // -----

  del: function (/* args */) {
    var self = this;
    var removedCount = 0;
    _.each(arguments, function (key) {
      if (self._has(key)) {
        removedCount++;
        self._remove(key);
      }
    });

    return removedCount;
  },
  exists: function (key) {
    var self = this;
    if (self._has(key))
      return 1;
    return 0;
  },
  keys: function (pattern) {
    if (! pattern)
      throw new Error("Wrong number of arguments for 'keys' command");
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

    if (! self._has(key))
      throw new Error("No such key");

    var val = self._get(key);
    self._remove(key);
    self._set(newkey, val);
  },
  renamenx: function (key, newkey) {
    var self = this;

    if (self._has(newkey))
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
    if (! self._has(key))
      return "none";

    var val = self._get(key);
    if (_.isString(val))
      return "string";
    return val.type();
  },
  // XXX has no reactivity and probably should be removed from the api entirely
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
    var val = self._has(key) ? self._get(key) : "";

    if (! _.isString(val))
      throwIncorrectKindOfValueError();

    val += value;
    self._set(key, val);

    return val.length;
  },
  decr: function (key) {
    var self = this;
    self.decrby(key, 1);
  },
  decrby: function (key, decrement) {
    var self = this;
    var val = self._has(key) ? self._get(key) : 0;

    if (! _.isString(val))
      throwIncorrectKindOfValueError();

    // cast to integer
    var newVal = val |0;

    if (val !== newVal.toString())
      throw new Error("Value is not an integer or out of range");

    self._set(key, (newVal - decrement).toString());
  },
  get: function (key) {
    var self = this;
    var val = self._has(key) ? self._get(key) : null;
    if (val !== null && ! _.isString(val))
      throwIncorrectKindOfValueError();
    // XXX shouldn't clone, strings are immutable
    return EJSON.clone(val);
  },
  getrange: function (key, start, end) {
    start = start || 0;
    end = end || 0;

    var self = this;
    var val = self._has(key) ? self._get(key) : "";

    if (! _.isString(val))
      throwIncorrectKindOfValueError();
    if (val === "")
      return "";

    var len = val.length;
    var normalizedBounds = normalizeBounds(start, end, len);
    start = normalizedBounds.start;
    end = normalizedBounds.end;

    if (end < start)
      return "";

    return val.substr(start, end - start + 1);
  },
  getset: function (key, value) {
    var self = this;
    var val = self.get(key);
    self.set(key, value.toString());
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
    var val = self._has(key) ? self._get(key) : 0;

    if (! _.isString(val))
      throwIncorrectKindOfValueError();

    // cast to integer
    var newVal = parseFloat(val);

    if (isNaN(newVal))
      throw new Error("Value is not a valid float");

    self._set(key, (newVal + increment).toString());
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
      return (i % 2 === 1) || self._has(key);
    })) {
      self.mset.apply(self, arguments);
      return 1;
    }

    return 0;
  },
  set: function (key, value) {
    var self = this;
    self._set(key, value.toString());
  },
  setnx: function (key, value) {
    var self = this;
    if (self._has(key))
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
  lpush: function (/* values */) {
    var values = _.invoke(arguments, "toString");
    Array.prototype.splice.apply(this._list, [0, 0].concat(values));
    return this._list.length;
  },
  rpush: function (/* values */) {
    var values = _.invoke(arguments, "toString");
    Array.prototype.push.apply(this._list, values);
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
  linsert: function (beforeAfter, pivot, value) {
    var self = this;
    var pos = _.indexOf(self._list, pivot.toString());
    var isBefore = beforeAfter.toLowerCase() === "before";

    if (pos === -1)
      return -1;

    self._list.splice(isBefore ? pos : pos + 1, 0, value.toString());
    return self._list.length;
  },
  lrange: function (start, stop) {
    var self = this;
    var normalizedBounds = normalizeBounds(start, stop, self._list.length);
    start = normalizedBounds.start;
    stop = normalizedBounds.end;

    if (start > stop)
      return [];

    return self._list.slice(start, stop + 1);
  },
  lset: function (index, value) {
    if (index < 0)
      index = this._length + index;
    this._list[index] = value.toString();
  },
  ltrim: function (start, stop) {
    this._list = this.lrange(start, stop);
  },
  llen: function () {
    return this._list.length;
  },
  type: function () { return "list"; },
  toArray: function () { return this._list.slice(0); }
});

_.each(["lpushx", "rpushx"], function (method) {
  Miniredis.RedisStore.prototype[method] = function (key/* args */) {
    var self = this;

    if (! self._has(key))
      return 0;
    return self[method.slice(0, -1)].apply(self, arguments);
  };
});

_.each(["lpush", "rpush", "lpop", "rpop", "lindex", "linsert", "lrange",
        "lset", "ltrim", "llen"],
       function (method) {
         Miniredis.RedisStore.prototype[method] = function (key/*, args */) {
           var self = this;
           var args = _.toArray(arguments).slice(1);

           if (! self._has(key))
             self._set(key, new Miniredis.List);

           var list = self._get(key);
           if (! (list instanceof Miniredis.List))
             throwIncorrectKindOfValueError();

           // reset the value to a dummy value just to trigger invalidate
           // through _set method
           self._set(key, "dummy");
           var res = Miniredis.List.prototype[method].apply(list, args);
           self._set(key, list);
           return res;
         };
       });

function normalizeBounds (start, end, len) {
  // put start and end into [0, len) range
  start %= len;
  if (start < 0)
    start += len;
  if (end >= len)
    end = len - 1;
  end %= len;
  if (end < 0)
    end += len;
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

