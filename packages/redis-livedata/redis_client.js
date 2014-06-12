/**
 * Simple wrapper/helpers for the Redis NPM client.  Server only.
 */

var RedisNpm = Npm.require('redis');
var UrlNpm = Npm.require('url');

RedisInternals.NpmModule = RedisNpm;

RedisClient = function (url, options) {
  var self = this;
  options = options || {};

  var parsedUrl = UrlNpm.parse(url);
  var host = parsedUrl.hostname || '127.0.0.1';
  var port = parseInt(parsedUrl.port || '6379');

  self._connection = RedisNpm.createClient(port, host, options);
};

RedisClient.prototype.subscribeKeyspaceEvents = function (callback, listener) {
  var self = this;

  self._connection.on("pmessage", function (pattern, channel, message) {
    Meteor._debug("Redis ("+  pattern +")" + " notification: " + channel + ": " + message);
    var colonIndex = channel.indexOf(":");
    if (channel.indexOf("__keyspace@") != 0 || colonIndex == 0) {
      Meteor._debug("Unrecognized channel: " + channel);
      return;
    }
    var key = channel.substr(colonIndex+1);
    listener(key, message);
  });
  self._connection.psubscribe("__keyspace@*", callback);
};

RedisClient.prototype.findCandidateKeys = function (collectionName, matcher, callback) {
  var self = this;

  // Special case the single-document matcher
  // {"_paths":{"_id":true},"_hasGeoQuery":false,"_hasWhere":false,"_isSimple":true,"_selector":{"_id":"XhjyfgEbYyoYTiABX"}}
  var simpleKeys = null;
  if (!matcher._hasGeoQuery && !matcher._hasWhere && matcher._isSimple) {
    var keys = _.keys(matcher._selector);
    Meteor._debug("keys: " + keys);
    if (keys.length == 1 && keys[0] === "_id") {
      var selectorId = matcher._selector._id;
      if (typeof selectorId === 'string') {
        simpleKeys = [collectionName + "//" + selectorId];
        Meteor._debug("Detected simple id query: " + simpleKeys);
      }
    }
  }
  
  if (simpleKeys === null) {
    self._connection.keys(collectionName + "//*", Meteor.bindEnvironment(callback));
  } else {
    callback(null, simpleKeys);
  }
};

RedisClient.prototype.keys = function (matcher, callback) {
  var self = this;

  self._connection.keys(matcher, Meteor.bindEnvironment(callback));
};

RedisClient.prototype.hgetall = function (key, callback) {
  var self = this;

  self._connection.hgetall(key, Meteor.bindEnvironment(function (err, result) {
    // Mongo returns undefined here, our Redis binding returns null
    if (result === null) {
      result = undefined;
    }
    callback(err, result);
  }));
};


RedisClient.prototype.incr = function (key, callback) {
  var self = this;

  self._connection.incr(key, callback);
};

RedisClient.prototype.getAll = function (keys, callback) {
  var self = this;
  
  var connection = self._connection;

  var errors = [];
  var values = [];
  var replyCount = 0;
  
  var n = keys.length;
  
  if (n == 0) {
    callback(errors, values);
    return;
  }

  _.each(_.range(n), function(i) {
    var key = keys[i];
    connection.get(key, Meteor.bindEnvironment(function(err, value) {
      if (err) {
        Meteor._debug("Error getting key from redis: " + err);
      }
      errors[i] = err;
      values[i] = value;
      
      replyCount++;
      if (replyCount == n) {
        callback(errors, values);
      }
    }));
  });
};

RedisClient.prototype.setAll = function (keys, values, callback) {
  var self = this;
  
  var connection = self._connection;

  var errors = [];
  var results = [];
  
  var n = keys.length;
  if (n == 0) {
    callback(errors, results);
    return;
  }

  var replyCount = 0;
  _.each(_.range(n), function(i) {
    var key = keys[i];
    var value = values[i];
    
    connection.set(key, value, Meteor.bindEnvironment(function(err, result) {
      if (err) {
        Meteor._debug("Error setting value in redis: " + err);
      }
      errors[i] = err;
      results[i] = result;
      
      replyCount++;
      if (replyCount == n) {
        callback(errors, results);
      }
    }));
  });
};


RedisClient.prototype.removeAll = function (keys, callback) {
  var self = this;
  
  var connection = self._connection;

  var errors = [];
  var results = [];
  
  var n = keys.length;
  if (n == 0) {
    callback(errors, results);
    return;
  }

  var replyCount = 0;
  _.each(_.range(n), function(i) {
    var key = keys[i];
    connection.del(key, Meteor.bindEnvironment(function(err, result) {
      if (err) {
        Meteor._debug("Error deleting key in redis: " + err);
      }
      errors[i] = err;
      results[i] = result;
      
      replyCount++;
      if (replyCount == n) {
        callback(errors, results);
      }
    }));
  });
};