// Ensure that we're running in a fiber on the server.

var runInFiber;
if (Meteor.isServer) {
  var Fiber = Npm.require('fibers');
  runInFiber = function (fn) {
    Fiber(fn).run();
  };
} else {
  runInFiber = function (fn) {
    fn();
  };
}

// Heartbeat options:
//   heartbeatInterval: interval to send pings, in milliseconds.
//   heartbeatTimeout: timeout to close the connection if a reply isn't received, in milliseconds.
//   sendMessage: function to call to send a message on the connection.
//   closeConnection: function to call to close the connection.

Heartbeat = function (options) {
  var self = this;

  // Whether "ping" and "pong" messages are supported by the DDP
  // version.  Set by `start` below.
  self.supported = false;

  self.heartbeatInterval = options.heartbeatInterval;
  self.heartbeatTimeout = options.heartbeatTimeout;
  self._sendMessage = options.sendMessage;
  self._closeConnection = options.closeConnection;

  self._heartbeatIntervalHandle = null;
  self._heartbeatTimeoutHandle = null;

  // For testing, sending pings or pongs can be disabled.
  self._sendPing = true;
  self._sendPong = true;
};

_.extend(Heartbeat.prototype, {
  stop: function () {
    var self = this;
    self._clearHeartbeatIntervalTimer();
    self._clearHeartbeatTimeoutTimer();
  },

  start: function (ddpVersion) {
    var self = this;
    self.stop();
    if (ddpVersion === 'pre2') {
      self.supported = true;
      self._startHeartbeatIntervalTimer();
    }
  },

  _startHeartbeatIntervalTimer: function () {
    var self = this;
    if (!self._sendPing)
      return;
    runInFiber(function () {
      if (!self.supported)
        return;
      self._heartbeatIntervalHandle = Meteor.setTimeout(
        _.bind(self._heartbeatIntervalFired, self),
        self.heartbeatInterval
      );
    });
  },

  _startHeartbeatTimeoutTimer: function () {
    var self = this;
    runInFiber(function () {
      if (!self.supported)
        return;
      self._heartbeatTimeoutHandle = Meteor.setTimeout(
        _.bind(self._heartbeatTimeoutFired, self),
        self.heartbeatTimeout
      );
    });
  },

  _clearHeartbeatIntervalTimer: function () {
    var self = this;
    if (self._heartbeatIntervalHandle) {
      Meteor.clearTimeout(self._heartbeatIntervalHandle);
      self._heartbeatIntervalHandle = null;
    }
  },

  _clearHeartbeatTimeoutTimer: function () {
    var self = this;
    if (self._heartbeatTimeoutHandle) {
      Meteor.clearTimeout(self._heartbeatTimeoutHandle);
      self._heartbeatTimeoutHandle = null;
    }
  },

  // The heartbeat interval timer is fired when we should send a ping.
  _heartbeatIntervalFired: function () {
    var self = this;
    self._heartbeatIntervalHandle = null;
    if (!self._sendPing)
      return;
    self._sendMessage({msg: "ping"});
    // Wait for a pong.
    self._startHeartbeatTimeoutTimer();
  },

  // The heartbeat timeout timer is fired when we sent a ping, but we
  // timed out waiting for the pong.
  _heartbeatTimeoutFired: function () {
    var self = this;
    self._heartbeatTimeoutHandle = null;
    if (!self._sendPing)
      return;
    self._closeConnection();
  },

  pingpongReceived: function (msg) {
    var self = this;

    if (msg.msg === 'ping') {
      // Respond to a ping by sending a pong.
      if (self._sendPong)
        self._sendMessage({msg: "pong", id: msg.id});

      // We know the connection is alive if we receive a ping, so we
      // don't need to send a ping ourselves.  Reset the interval timer.
      if (self._heartbeatIntervalHandle) {
        self._clearHeartbeatIntervalTimer();
        self._startHeartbeatIntervalTimer();
      }
    }

    else if (msg.msg === 'pong') {
      // Receiving a pong means we won't timeout, so clear the timeout
      // timer and start the interval again.
      if (self._heartbeatTimeoutHandle) {
        self._clearHeartbeatTimeoutTimer();
        self._startHeartbeatIntervalTimer();
      }
    }
  }
});
