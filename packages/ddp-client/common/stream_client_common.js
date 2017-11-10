import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { _ } from 'meteor/underscore';
import { Tracker } from 'meteor/tracker';
import { Retry } from 'meteor/retry';

import { DDP, LivedataTest } from './namespace.js';

export function addCommonMethodsToPrototype(proto) {
  _.extend(proto, {
    // Register for callbacks.
    on: function(name, callback) {
      var self = this;

      if (name !== 'message' && name !== 'reset' && name !== 'disconnect')
        throw new Error('unknown event type: ' + name);

      if (!self.eventCallbacks[name]) self.eventCallbacks[name] = [];
      self.eventCallbacks[name].push(callback);
    },

    _initCommon: function(options) {
      var self = this;
      options = options || {};

      //// Constants

      // how long to wait until we declare the connection attempt
      // failed.
      self.CONNECT_TIMEOUT = options.connectTimeoutMs || 10000;

      self.eventCallbacks = {}; // name -> [callback]

      self._forcedToDisconnect = false;

      //// Reactive status
      self.currentStatus = {
        status: 'connecting',
        connected: false,
        retryCount: 0
      };

      self.statusListeners =
        typeof Tracker !== 'undefined' && new Tracker.Dependency();
      self.statusChanged = function() {
        if (self.statusListeners) self.statusListeners.changed();
      };

      //// Retry logic
      self._retry = new Retry();
      self.connectionTimer = null;
    },

    // Trigger a reconnect.
    reconnect: function(options) {
      var self = this;
      options = options || {};

      if (options.url) {
        self._changeUrl(options.url);
      }

      if (options._sockjsOptions) {
        self.options._sockjsOptions = options._sockjsOptions;
      }

      if (self.currentStatus.connected) {
        if (options._force || options.url) {
          // force reconnect.
          self._lostConnection(new DDP.ForcedReconnectError());
        } // else, noop.
        return;
      }

      // if we're mid-connection, stop it.
      if (self.currentStatus.status === 'connecting') {
        // Pretend it's a clean close.
        self._lostConnection();
      }

      self._retry.clear();
      self.currentStatus.retryCount -= 1; // don't count manual retries
      self._retryNow();
    },

    disconnect: function(options) {
      var self = this;
      options = options || {};

      // Failed is permanent. If we're failed, don't let people go back
      // online by calling 'disconnect' then 'reconnect'.
      if (self._forcedToDisconnect) return;

      // If _permanent is set, permanently disconnect a stream. Once a stream
      // is forced to disconnect, it can never reconnect. This is for
      // error cases such as ddp version mismatch, where trying again
      // won't fix the problem.
      if (options._permanent) {
        self._forcedToDisconnect = true;
      }

      self._cleanup();
      self._retry.clear();

      self.currentStatus = {
        status: options._permanent ? 'failed' : 'offline',
        connected: false,
        retryCount: 0
      };

      if (options._permanent && options._error)
        self.currentStatus.reason = options._error;

      self.statusChanged();
    },

    // maybeError is set unless it's a clean protocol-level close.
    _lostConnection: function(maybeError) {
      var self = this;

      self._cleanup(maybeError);
      self._retryLater(maybeError); // sets status. no need to do it here.
    },

    // fired when we detect that we've gone online. try to reconnect
    // immediately.
    _online: function() {
      // if we've requested to be offline by disconnecting, don't reconnect.
      if (this.currentStatus.status != 'offline') this.reconnect();
    },

    _retryLater: function(maybeError) {
      var self = this;

      var timeout = 0;
      if (
        self.options.retry ||
        (maybeError && maybeError.errorType === 'DDP.ForcedReconnectError')
      ) {
        timeout = self._retry.retryLater(
          self.currentStatus.retryCount,
          _.bind(self._retryNow, self)
        );
        self.currentStatus.status = 'waiting';
        self.currentStatus.retryTime = new Date().getTime() + timeout;
      } else {
        self.currentStatus.status = 'failed';
        delete self.currentStatus.retryTime;
      }

      self.currentStatus.connected = false;
      self.statusChanged();
    },

    _retryNow: function() {
      var self = this;

      if (self._forcedToDisconnect) return;

      self.currentStatus.retryCount += 1;
      self.currentStatus.status = 'connecting';
      self.currentStatus.connected = false;
      delete self.currentStatus.retryTime;
      self.statusChanged();

      self._launchConnection();
    },

    // Get current status. Reactive.
    status: function() {
      var self = this;
      if (self.statusListeners) self.statusListeners.depend();
      return self.currentStatus;
    }
  });
}
