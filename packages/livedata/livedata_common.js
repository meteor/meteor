DDP = {};

SUPPORTED_DDP_VERSIONS = [ 'pre1' ];

LivedataTest.SUPPORTED_DDP_VERSIONS = SUPPORTED_DDP_VERSIONS;

MethodInvocation = function (options) {
  var self = this;

  // true if we're running not the actual method, but a stub (that is,
  // if we're on a client (which may be a browser, or in the future a
  // server connecting to another server) and presently running a
  // simulation of a server-side method for latency compensation
  // purposes). not currently true except in a client such as a browser,
  // since there's usually no point in running stubs unless you have a
  // zero-latency connection to the user.
  this.isSimulation = options.isSimulation;

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

  // On the server, the connection this method call came in on.
  this.connection = options.connection;
};

_.extend(MethodInvocation.prototype, {
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

parseDDP = function (stringMessage) {
  try {
    var msg = JSON.parse(stringMessage);
  } catch (e) {
    Meteor._debug("Discarding message with invalid JSON", stringMessage);
    return null;
  }
  // DDP messages must be objects.
  if (msg === null || typeof msg !== 'object') {
    Meteor._debug("Discarding non-object DDP message", stringMessage);
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
      msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);
  });

  return msg;
};

stringifyDDP = function (msg) {
  var cleared = [], baseObj = {};
  var hasFields = _.has(msg, 'fields');
  // swizzle 'changed' messages from 'fields undefined' rep to 'fields
  // and cleared' rep
  if (hasFields) {
    _.each(msg.fields, function (value, key) {
      if (value === undefined) {
        cleared.push(key);
      }
    });
    if (!_.isEmpty(cleared))
      baseObj.cleared = cleared;
  }
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }
  
  var doneRemovingFields = false;
  function customStringifyDDPReplacer(key, value) {
    // Stringify non-objects like normal
    if (typeof value !== 'object') {
      return value;
    }

    // Special handling for `fields` property
    if (hasFields && !doneRemovingFields && key === 'fields') {
      var fieldObj = {};
      _.each(value, function(v, k) {
        if (v !== undefined) {
          fieldObj[k] = v;
        }
      });
      doneRemovingFields = true; //in case there's another key named `fields`
      return _.isEmpty(fieldObj) ? undefined : fieldObj;
    }

    // For objects, converts them to basic JSON values.
    // If return value is undefined, the key won't be included.
    var basicValue = EJSON._toJSONValueHelper(value);
    return (basicValue === undefined) ? value : basicValue;
  }
          
  return JSON.stringify(_.extend(baseObj, msg), customStringifyDDPReplacer);
};

// This is private but it's used in a few places. accounts-base uses
// it to get the current user. accounts-password uses it to stash SRP
// state in the DDP session. Meteor.setTimeout and friends clear
// it. We can probably find a better way to factor this.
DDP._CurrentInvocation = new Meteor.EnvironmentVariable;