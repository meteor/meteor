// Heartbeat options:
//   heartbeatInterval: interval to send pings, in milliseconds.
//   heartbeatTimeout: timeout to close the connection if a reply isn't
//     received, in milliseconds.
//   sendPing: function to call to send a ping on the connection.
//   onTimeout: function to call to close the connection.

DDPCommon.Heartbeat = class Heartbeat {
  constructor(options) {
    this.heartbeatInterval = options.heartbeatInterval;
    this.heartbeatTimeout = options.heartbeatTimeout;
    this._sendPing = options.sendPing;
    this._onTimeout = options.onTimeout;
    this._seenPacket = false;

    this._heartbeatIntervalHandle = null;
    this._heartbeatTimeoutHandle = null;
  }

  stop() {
    this._clearHeartbeatIntervalTimer();
    this._clearHeartbeatTimeoutTimer();
  }

  start() {
    this.stop();
    this._startHeartbeatIntervalTimer();
  }

  _startHeartbeatIntervalTimer() {
    this._heartbeatIntervalHandle = Meteor.setInterval(
      () => this._heartbeatIntervalFired(),
      this.heartbeatInterval
    );
  }

  _startHeartbeatTimeoutTimer() {
    this._heartbeatTimeoutHandle = Meteor.setTimeout(
      () => this._heartbeatTimeoutFired(),
      this.heartbeatTimeout
    );
  }

  _clearHeartbeatIntervalTimer() {
    if (this._heartbeatIntervalHandle) {
      Meteor.clearInterval(this._heartbeatIntervalHandle);
      this._heartbeatIntervalHandle = null;
    }
  }

  _clearHeartbeatTimeoutTimer() {
    if (this._heartbeatTimeoutHandle) {
      Meteor.clearTimeout(this._heartbeatTimeoutHandle);
      this._heartbeatTimeoutHandle = null;
    }
  }

  // The heartbeat interval timer is fired when we should send a ping.
  _heartbeatIntervalFired() {
    // don't send ping if we've seen a packet since we last checked,
    // *or* if we have already sent a ping and are awaiting a timeout.
    // That shouldn't happen, but it's possible if
    // `this.heartbeatInterval` is smaller than
    // `this.heartbeatTimeout`.
    if (! this._seenPacket && ! this._heartbeatTimeoutHandle) {
      this._sendPing();
      // Set up timeout, in case a pong doesn't arrive in time.
      this._startHeartbeatTimeoutTimer();
    }
    this._seenPacket = false;
  }

  // The heartbeat timeout timer is fired when we sent a ping, but we
  // timed out waiting for the pong.
  _heartbeatTimeoutFired() {
    this._heartbeatTimeoutHandle = null;
    this._onTimeout();
  }

  messageReceived() {
    // Tell periodic checkin that we have seen a packet, and thus it
    // does not need to send a ping this cycle.
    this._seenPacket = true;
    // If we were waiting for a pong, we got it.
    if (this._heartbeatTimeoutHandle) {
      this._clearHeartbeatTimeoutTimer();
    }
  }
};
