import { Retry } from 'meteor/retry';

const forcedReconnectError = new Error("forced reconnect");

export class StreamClientCommon {
  constructor(options) {
    this.options = {
      retry: true,
      ...(options || null),
    };

    this.ConnectionError =
      options && options.ConnectionError || Error;
  }

  // Register for callbacks.
  on(name, callback) {
    if (name !== 'message' && name !== 'reset' && name !== 'disconnect')
      throw new Error('unknown event type: ' + name);

    if (!this.eventCallbacks[name]) this.eventCallbacks[name] = [];
    this.eventCallbacks[name].push(callback);
  }

  forEachCallback(name, cb) {
    if (!this.eventCallbacks[name] || !this.eventCallbacks[name].length) {
      return;
    }

    this.eventCallbacks[name].forEach(cb);
  }

  _initCommon(options) {
    options = options || Object.create(null);

    //// Constants

    // how long to wait until we declare the connection attempt
    // failed.
    this.CONNECT_TIMEOUT = options.connectTimeoutMs || 10000;

    this.eventCallbacks = Object.create(null); // name -> [callback]

    this._forcedToDisconnect = false;

    //// Reactive status
    this.currentStatus = {
      status: 'connecting',
      connected: false,
      retryCount: 0
    };

    if (Package.tracker) {
      this.statusListeners = new Package.tracker.Tracker.Dependency();
    }

    this.statusChanged = () => {
      if (this.statusListeners) {
        this.statusListeners.changed();
      }
    };

    //// Retry logic
    this._retry = new Retry();
    this.connectionTimer = null;
  }

  // Trigger a reconnect.
  reconnect(options) {
    options = options || Object.create(null);

    if (options.url) {
      this._changeUrl(options.url);
    }

    if (options._sockjsOptions) {
      this.options._sockjsOptions = options._sockjsOptions;
    }

    if (this.currentStatus.connected) {
      if (options._force || options.url) {
        this._lostConnection(forcedReconnectError);
      }
      return;
    }

    // if we're mid-connection, stop it.
    if (this.currentStatus.status === 'connecting') {
      // Pretend it's a clean close.
      this._lostConnection();
    }

    this._retry.clear();
    this.currentStatus.retryCount -= 1; // don't count manual retries
    this._retryNow();
  }

  disconnect(options) {
    options = options || Object.create(null);

    // Failed is permanent. If we're failed, don't let people go back
    // online by calling 'disconnect' then 'reconnect'.
    if (this._forcedToDisconnect) return;

    // If _permanent is set, permanently disconnect a stream. Once a stream
    // is forced to disconnect, it can never reconnect. This is for
    // error cases such as ddp version mismatch, where trying again
    // won't fix the problem.
    if (options._permanent) {
      this._forcedToDisconnect = true;
    }

    this._cleanup();
    this._retry.clear();

    this.currentStatus = {
      status: options._permanent ? 'failed' : 'offline',
      connected: false,
      retryCount: 0
    };

    if (options._permanent && options._error)
      this.currentStatus.reason = options._error;

    this.statusChanged();
  }

  // maybeError is set unless it's a clean protocol-level close.
  _lostConnection(maybeError) {
    this._cleanup(maybeError);
    this._retryLater(maybeError); // sets status. no need to do it here.
  }

  // fired when we detect that we've gone online. try to reconnect
  // immediately.
  _online() {
    // if we've requested to be offline by disconnecting, don't reconnect.
    if (this.currentStatus.status != 'offline') this.reconnect();
  }

  _retryLater(maybeError) {
    var timeout = 0;
    if (this.options.retry ||
        maybeError === forcedReconnectError) {
      timeout = this._retry.retryLater(
        this.currentStatus.retryCount,
        this._retryNow.bind(this)
      );
      this.currentStatus.status = 'waiting';
      this.currentStatus.retryTime = new Date().getTime() + timeout;
    } else {
      this.currentStatus.status = 'failed';
      delete this.currentStatus.retryTime;
    }

    this.currentStatus.connected = false;
    this.statusChanged();
  }

  _retryNow() {
    if (this._forcedToDisconnect) return;

    this.currentStatus.retryCount += 1;
    this.currentStatus.status = 'connecting';
    this.currentStatus.connected = false;
    delete this.currentStatus.retryTime;
    this.statusChanged();

    this._launchConnection();
  }

  // Get current status. Reactive.
  status() {
    if (this.statusListeners) {
      this.statusListeners.depend();
    }
    return this.currentStatus;
  }
}
