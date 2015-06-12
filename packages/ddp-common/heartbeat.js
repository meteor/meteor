// Heartbeat options:
//   heartbeatInterval: interval to send pings, in milliseconds.
//   heartbeatTimeout: timeout to close the connection if a reply isn't
//     received, in milliseconds.
//   sendPing: function to call to send a ping on the connection.
//   onTimeout: function to call to close the connection.

DDPCommon.Heartbeat = function (options) {
  var self = this;

  self.heartbeatInterval = options.heartbeatInterval;
  self.heartbeatTimeout = options.heartbeatTimeout;
  self._sendPing = options.sendPing;
  self._onTimeout = options.onTimeout;
  self._seenPacket = false;

  self._heartbeatIntervalHandle = null;
  self._heartbeatTimeoutHandle = null;
};

_.extend(DDPCommon.Heartbeat.prototype, {
  stop: function () {
    var self = this;
    self._clearHeartbeatIntervalTimer();
    self._clearHeartbeatTimeoutTimer();
  },

  start: function () {
    var self = this;
    self.stop();
    self._startHeartbeatIntervalTimer();
  },

  _startHeartbeatIntervalTimer: function () {
    var self = this;
    self._heartbeatIntervalHandle = Meteor.setInterval(
      _.bind(self._heartbeatIntervalFired, self),
      self.heartbeatInterval
    );
  },

  _startHeartbeatTimeoutTimer: function () {
    var self = this;
    self._heartbeatTimeoutHandle = Meteor.setTimeout(
      _.bind(self._heartbeatTimeoutFired, self),
      self.heartbeatTimeout
    );
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
    if (!self._seenPacket) {
      self._sendPing();
      // Set up timeout, in case a pong doesn't arrive in time.
      self._startHeartbeatTimeoutTimer();
    }
    self._seenPacket = false;
  },

  // The heartbeat timeout timer is fired when we sent a ping, but we
  // timed out waiting for the pong.
  _heartbeatTimeoutFired: function () {
    var self = this;
    self._heartbeatTimeoutHandle = null;
    self._onTimeout();
  },

  messageReceived: function () {
    var self = this;
    // Tell periodic checkin that we're fine
    self._seenPacket = true;
    // If we were waiting for a pong, clear this.
    if (self._heartbeatTimeoutHandle) {
      self._clearHeartbeatTimeoutTimer();
    }
  }
});
