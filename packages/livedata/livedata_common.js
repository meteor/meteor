(function () {
Meteor._SUPPORTED_DDP_VERSIONS = [ 'pre1' ];

Meteor._MethodInvocation = function (options) {
  var self = this;

  // true if we're running not the actual method, but a stub (that is,
  // if we're on a client (which may be a browser, or in the future a
  // server connecting to another server) and presently running a
  // simulation of a server-side method for latency compensation
  // purposes). not currently true except in a client such as a browser,
  // since there's usually no point in running stubs unless you have a
  // zero-latency connection to the user.
  this.isSimulation = options.isSimulation;

  // XXX Backwards compatibility only. Remove this before 1.0.
  this.is_simulation = this.isSimulation;

  // call this function to allow other method invocations (from the
  // same client) to continue running without waiting for this one to
  // complete.
  this.unblock = options.unblock || function () {};

  // current user id
  this.userId = options.userId;

  // sets current user id in all appropriate server contexts and
  // reruns subscriptions
  this._setUserId = options.setUserId || function () {};

  // Scratch data scoped to this connection (livedata_connection on the
  // client, livedata_session on the server). This is only used
  // internally, but we should have real and documented API for this
  // sort of thing someday.
  this._sessionData = options.sessionData;
};

_.extend(Meteor._MethodInvocation.prototype, {
  setUserId: function(userId) {
    this.userId = userId;
    this._setUserId(userId);
  }
});


var customTypes = {};
// Add a custom type, using a method of your choice to get to and
// from a basic JSON-able representation.
// The type you add must have:
// - A clone() method, so that Meteor can deep-copy it when necessary.
// - A equals() method, so that Meteor can compare it
// - A serializeForEval() method, so that Meteor can compile it into selectors
// It is okay if these methods are monkey-patched on.
// XXX: doc this
Meteor.addCustomType = function (options) {
  if (_.has(customTypes, options.name))
    throw new Error("Type " + options.name + " already present");
  var missingMethods = _.difference(['name', 'toBasic', 'fromBasic', 'recognize'], _.keys(options));
  if (!_.isEmpty(missingMethods))
    throw new Error("Meteor.addCustomType argument for type " + options.name +
                    " is missing methods: " + JSON.stringify(missingMethods));
  customTypes[options.name] = options;
};

var builtinConverters = [
  { // undefined
    matchBasic: function (obj) {
      return _.has(obj, '$undefined') && _.size(obj) === 1;
    },
    matchObject: function (obj) {
      return obj === undefined;
    },
    toBasic: function (obj) {
      return {$undefined: null};
    },
    fromBasic: function (obj) {
      return undefined;
    }
  },
  { // Date
    matchBasic: function (obj) {
      return _.has(obj, '$date') && _.size(obj) === 1;
    },
    matchObject: function (obj) {
      return obj instanceof Date;
    },
    toBasic: function (obj) {
      return {$date: obj.getTime()};
    },
    fromBasic: function (obj) {
      return new Date(obj.$date);
    }
  },
  { // Literal
    matchBasic: function (obj) {
      return _.has(obj, '$literal') && _.size(obj) === 1;
    },
    matchObject: function (obj) {
      if (_.isEmpty(obj) || _.size(obj) > 2) {
        return false;
      }
      return _.any(builtinConverters, function (converter) {
        return converter.matchBasic(obj);
      });
    },
    toBasic: function (obj) {
      return {$literal: obj};
    },
    fromBasic: function (obj) {
      return obj.$literal;
    }
  },
  { // Custom
    matchBasic: function (obj) {
      return _.has(obj, '$type') && _.has(obj, '$value') && _.size(obj) === 2;
    },
    matchObject: function (obj) {
      return _.any(customTypes, function (type) {
        return type.recognize(obj);
      });
    },
    toBasic: function (obj) {
      var typeName = null;
      var converter = _.find(customTypes, function(type, name) {
        typeName = name;
        return type.recognize(obj);
      });
      return {$type: typeName, $value: converter.toBasic(obj)};
    },
    fromBasic: function (obj) {
      var converter = customTypes[obj.$type];
      return converter.fromBasic(obj.$value);
    }
  }
];


var adjustTypesToBasic = function (obj) {
  _.each(obj, function (value, key) {
    if (typeof value !== 'object' && value !== undefined)
      return; // continue
    var changed = toJSONCompatibleHelper(value);
    if (changed) {
      obj[key] = changed;
      return; // on to the next key
    }
    // if we get here, value is an object but not adjustable
    // at this level.  recurse.
    adjustTypesToBasic(value);
  });
};

var toJSONCompatibleHelper = function (item) {
  for (var i = 0; i < builtinConverters.length; i++) {
    var converter = builtinConverters[i];
    if (converter.matchObject(item)) {
      return converter.toBasic(item);
    }
  }
  return undefined;
};

Meteor._toJSONCompatible = function (item) {
  var changed = toJSONCompatibleHelper(item);
  if (changed !== undefined)
    return changed;
  if (typeof item === 'object') {
    item = LocalCollection._deepcopy(item);
    adjustTypesToBasic(item);
  }
  return item;
};


var adjustTypesFromBasic = function (obj) {
  _.each(obj, function (value, key) {
    if (typeof value === 'object') {
      var changed = fromJSONCompatibleHelper(value);
      if (value !== changed) {
        obj[key] = changed;
        return;
      }
      // if we get here, value is an object but not adjustable
      // at this level.  recurse.
      adjustTypesFromBasic(value);
    }
  });
};

var fromJSONCompatibleHelper = function (value) {
  if (typeof value === 'object' && value !== null) {
    if (_.size(value) <= 2
        && _.all(value, function (v, k) { return k[0] === '$';})) {
      for (var i = 0; i < builtinConverters.length; i++) {
        var converter = builtinConverters[i];
        if (converter.matchBasic(value)) {
          return converter.fromBasic(value);
        }
      }
    }
  }
  return value;
};

Meteor._fromJSONCompatible = function (item) {
  var changed = fromJSONCompatibleHelper(item);
  if (changed === item && typeof item === 'object') {
    item = LocalCollection._deepcopy(item);
    adjustTypesFromBasic(item);
    return item;
  } else {
    return changed;
  }
};

Meteor._parseDDP = function (stringMessage) {
  //console.log("received " + stringMessage);
  var msg = JSON.parse(stringMessage);
  //massage msg to get it into "abstract ddp" rather than "wire ddp" format.

  // switch between "cleared" rep of unsetting fields and "undefined" rep of same
  if (_.has(msg, 'cleared')) {
    if (!_.has(msg, 'fields'))
      msg.fields = {};
    _.each(msg.cleared, function (clearKey) {
      msg.fields[clearKey] = undefined;
    });
    delete msg.cleared;
  }

  _.each(['fields', 'params', 'result'], function (field) {
    if (_.has(msg, field))
      adjustTypesFromBasic(msg[field]);
  });


  return msg;
};

Meteor._stringifyDDP = function (msg) {
  var copy = LocalCollection._deepcopy(msg);
  // swizzle 'changed' messages from 'fields undefined' rep to 'fields and cleared' rep
  if (_.has(msg, 'fields')) {
    var cleared = [];
    _.each(msg.fields, function (value, key) {
      if (key === undefined) {
        cleared.push(key);
        delete copy.fields[key];
      }
    });
    if (!_.isEmpty(cleared))
      copy.cleared = cleared;
    if (_.isEmpty(copy.fields))
      delete copy.fields;
  }
  // adjust types to basic
  _.each(['fields', 'params', 'result'], function (field) {
    if (_.has(copy, field))
      adjustTypesToBasic(copy[field]);
  });
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }
  var ret = JSON.stringify(copy);
  //console.log("sending " + ret);
  return ret;
};

Meteor._CurrentInvocation = new Meteor.EnvironmentVariable;

Meteor.Error = function (error, reason, details) {
  var self = this;

  // Currently, a numeric code, likely similar to a HTTP code (eg,
  // 404, 500). That is likely to change though.
  self.error = error;

  // Optional: A short human-readable summary of the error. Not
  // intended to be shown to end users, just developers. ("Not Found",
  // "Internal Server Error")
  self.reason = reason;

  // Optional: Additional information about the error, say for
  // debugging. It might be a (textual) stack trace if the server is
  // willing to provide one. The corresponding thing in HTTP would be
  // the body of a 404 or 500 response. (The difference is that we
  // never expect this to be shown to end users, only developers, so
  // it doesn't need to be pretty.)
  self.details = details;
};

Meteor.Error.prototype = new Error;
})();
