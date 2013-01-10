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
  this._unblock = options.unblock || function () {};
  this._calledUnblock = false;

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
  unblock: function () {
    var self = this;
    self._calledUnblock = true;
    self._unblock();
  },
  setUserId: function(userId) {
    var self = this;
    if (self._calledUnblock)
      throw new Error("Can't call setUserId in a method after calling unblock");
    self.userId = userId;
    self._setUserId(userId);
  }
});


var customTypes = {};
// Add a custom type, using a method of your choice to get to and
// from a basic JSON-able representation.  The factory argument
// is a function of JSON-able --> your object
// The type you add must have:
// - A clone() method, so that Meteor can deep-copy it when necessary.
// - A equals() method, so that Meteor can compare it
// - A toJSONValue() method, so that Meteor can serialize it
// - a typeName() method, to show how to look it up in our type table.
//   XXX GOING AWAY
// - A serializeForEval() method, so that Meteor can compile it into selectors.
// It is okay if these methods are monkey-patched on.
Meteor.addCustomType = function (name, factory) {
  if (_.has(customTypes, name))
    throw new Error("Type " + name + " already present");
  customTypes[name] = factory;
};

var builtinConverters = [
  { // undefined
    matchJSONValue: function (obj) {
      return _.has(obj, '$undefined') && _.size(obj) === 1;
    },
    matchObject: function (obj) {
      return obj === undefined;
    },
    toJSONValue: function (obj) {
      return {$undefined: null};
    },
    fromJSONValue: function (obj) {
      return undefined;
    }
  },
  { // Date
    matchJSONValue: function (obj) {
      return _.has(obj, '$date') && _.size(obj) === 1;
    },
    matchObject: function (obj) {
      return obj instanceof Date;
    },
    toJSONValue: function (obj) {
      return {$date: obj.getTime()};
    },
    fromJSONValue: function (obj) {
      return new Date(obj.$date);
    }
  },
  { // Literal
    matchJSONValue: function (obj) {
      return _.has(obj, '$literal') && _.size(obj) === 1;
    },
    matchObject: function (obj) {
      if (_.isEmpty(obj) || _.size(obj) > 2) {
        return false;
      }
      return _.any(builtinConverters, function (converter) {
        return converter.matchJSONValue(obj);
      });
    },
    toJSONValue: function (obj) {
      return {$literal: obj};
    },
    fromJSONValue: function (obj) {
      return obj.$literal;
    }
  },
  { // Custom
    matchJSONValue: function (obj) {
      return _.has(obj, '$type') && _.has(obj, '$value') && _.size(obj) === 2;
    },
    matchObject: function (obj) {
      return obj &&
        typeof obj.toJSONValue === 'function' &&
        typeof obj.typeName === 'function' &&
        _.has(customTypes, obj.typeName());
    },
    toJSONValue: function (obj) {
      return {$type: obj.typeName(), $value: obj.toJSONValue()};
    },
    fromJSONValue: function (obj) {
      var typeName = obj.$type;
      var converter = customTypes[typeName];
      return converter(obj.$value);
    }
  }
];


//for both arrays and objects
var adjustTypesToJSONValue = function (obj) {
  if (obj === null)
    return;
  _.each(obj, function (value, key) {
    if (typeof value !== 'object' && value !== undefined)
      return; // continue
    var changed = toJSONValueHelper(value);
    if (changed) {
      obj[key] = changed;
      return; // on to the next key
    }
    // if we get here, value is an object but not adjustable
    // at this level.  recurse.
    adjustTypesToJSONValue(value);
  });
};

// Either return the JSON-compatible version of the argument, or undefined (if
// the item isn't itself replaceable, but maybe some fields in it are)
var toJSONValueHelper = function (item) {
  for (var i = 0; i < builtinConverters.length; i++) {
    var converter = builtinConverters[i];
    if (converter.matchObject(item)) {
      return converter.toJSONValue(item);
    }
  }
  return undefined;
};

Meteor._toJSONValue = function (item) {
  var changed = toJSONValueHelper(item);
  if (changed !== undefined)
    return changed;
  if (typeof item === 'object') {
    item = LocalCollection._deepcopy(item);
    adjustTypesToJSONValue(item);
  }
  return item;
};

//for both arrays and objects
var adjustTypesFromJSONValue = function (obj) {
  if (obj === null)
    return;
  _.each(obj, function (value, key) {
    if (typeof value === 'object') {
      var changed = fromJSONValueHelper(value);
      if (value !== changed) {
        obj[key] = changed;
        return;
      }
      // if we get here, value is an object but not adjustable
      // at this level.  recurse.
      adjustTypesFromJSONValue(value);
    }
  });
};

// Either return the argument changed to have the non-json
// rep of itself (the Object version) or the argument itself.

// DOES NOT RECURSE.  For actually getting the fully-changed value, use
// Meteor._fromJSONValue
var fromJSONValueHelper = function (value) {
  if (typeof value === 'object' && value !== null) {
    if (_.size(value) <= 2
        && _.all(value, function (v, k) {
          return typeof k === 'string' && k.substr(0, 1) === '$';
        })) {
      for (var i = 0; i < builtinConverters.length; i++) {
        var converter = builtinConverters[i];
        if (converter.matchJSONValue(value)) {
          return converter.fromJSONValue(value);
        }
      }
    }
  }
  return value;
};

Meteor._fromJSONValue = function (item) {
  var changed = fromJSONValueHelper(item);
  if (changed === item && typeof item === 'object') {
    item = LocalCollection._deepcopy(item);
    adjustTypesFromJSONValue(item);
    return item;
  } else {
    return changed;
  }
};

Meteor._parseDDP = function (stringMessage) {
  try {
    var msg = JSON.parse(stringMessage);
  } catch (e) {
    Meteor._debug("Discarding message with invalid JSON", stringMessage);
    return null;
  }
  // massage msg to get it into "abstract ddp" rather than "wire ddp" format.

  // switch between "cleared" rep of unsetting fields and "undefined"
  // rep of same
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
      adjustTypesFromJSONValue(msg[field]);
  });


  return msg;
};

Meteor._stringifyDDP = function (msg) {
  var copy = LocalCollection._deepcopy(msg);
  // swizzle 'changed' messages from 'fields undefined' rep to 'fields
  // and cleared' rep
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
      adjustTypesToJSONValue(copy[field]);
  });
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }
  return JSON.stringify(copy);
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
