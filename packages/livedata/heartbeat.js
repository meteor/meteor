// Heartbeat options:
//   heartbeatInterval: interval to send pings, in milliseconds.
//   heartbeatTimeout: timeout to close the connection if a reply isn't
//     received, in milliseconds.
//   sendPing: function to call to send a ping on the connection.
//   onTimeout: function to call to close the connection.

Heartbeat = function (options) {
  var self = this;

  self.heartbeatInterval = options.heartbeatInterval;
  self.heartbeatTimeout = options.heartbeatTimeout;
  self._sendPing = options.sendPing;
  self._onTimeout = options.onTimeout;

  self._heartbeatIntervalHandle = null;
  self._heartbeatTimeoutHandle = null;
};

_.extend(Heartbeat.prototype, {
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
    self._heartbeatIntervalHandle = Meteor.setTimeout(
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
    self._heartbeatIntervalHandle = null;
    self._sendPing();
    // Wait for a pong.
    self._startHeartbeatTimeoutTimer();
  },

  // The heartbeat timeout timer is fired when we sent a ping, but we
  // timed out waiting for the pong.
  _heartbeatTimeoutFired: function () {
    var self = this;
    self._heartbeatTimeoutHandle = null;
    self._onTimeout();
  },

  pingReceived: function () {
    var self = this;
    // We know the connection is alive if we receive a ping, so we
    // don't need to send a ping ourselves.  Reset the interval timer.
    if (self._heartbeatIntervalHandle) {
      self._clearHeartbeatIntervalTimer();
      self._startHeartbeatIntervalTimer();
    }
  },

  pongReceived: function () {
    var self = this;

    // Receiving a pong means we won't timeout, so clear the timeout
    // timer and start the interval again.
    if (self._heartbeatTimeoutHandle) {
      self._clearHeartbeatTimeoutTimer();
      self._startHeartbeatIntervalTimer();
    }
  }
});
