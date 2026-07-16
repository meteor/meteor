import { Retry } from 'meteor/retry';

const forcedReconnectError = new Error("forced reconnect");

// Every status the stream can be in. The values are part of the public API
// (Meteor.status().status), so they are the historical lowercase strings.
//
//   CONNECTING ──socket open──► CONNECTED ──connection lost──► WAITING ──retry timer──► CONNECTING
//        │                                                        │
//        └──────────── connection lost, retry off ──► FAILED ◄────┘ (retry off)
//
//   disconnect()             → OFFLINE (revivable via reconnect / 'online')
//   disconnect({_permanent}) → FAILED with _forcedToDisconnect latched (terminal)
export const STATUS = Object.freeze({
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  WAITING: 'waiting',
  FAILED: 'failed',
  OFFLINE: 'offline',
});

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
      status: STATUS.CONNECTING,
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

  // The single point through which every status change flows. Fields set to
  // undefined are removed from the status object (retryTime and reason come
  // and go with their statuses). The status object is mutated in place, so a
  // reference returned by status() stays current across transitions.
  _setStatus(fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        delete this.currentStatus[key];
      } else {
        this.currentStatus[key] = value;
      }
    }
    this.statusChanged();
  }

  // Transition to CONNECTED. Called by the platform implementations from
  // their transport-level open events (after their own transport guards).
  _connected() {
    this._clearConnectionTimer();

    if (this.currentStatus.connected) {
      // already connected. do nothing. this probably shouldn't happen.
      return;
    }

    this._setStatus({
      status: STATUS.CONNECTED,
      connected: true,
      retryCount: 0,
    });

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    this.forEachCallback('reset', callback => {
      callback();
    });
  }

  // True once the stream has been permanently shut down
  // (disconnect({_permanent: true}), e.g. on DDP version negotiation
  // failure). Such a stream can never reconnect. Public accessor for the
  // layers above; the flag itself is internal.
  isForcedToDisconnect() {
    return this._forcedToDisconnect;
  }

  // Trigger a reconnect.
  reconnect(options) {
    options = options || Object.create(null);

    // A permanently shut down stream (disconnect({_permanent: true}))
    // cannot be revived — _retryNow refuses to relaunch it. Bail before
    // touching retry bookkeeping: the window 'online' handler calls this
    // on 'failed' streams, and the retryCount decrement below would
    // otherwise drift further negative on every online event.
    if (this._forcedToDisconnect) return;

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
    if (this.currentStatus.status === STATUS.CONNECTING) {
      // Pretend it's a clean close.
      this._lostConnection();
    }

    this._retry.clear();
    // don't count manual retries
    this._setStatus({ retryCount: this.currentStatus.retryCount - 1 });
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

    this._setStatus({
      status: options._permanent ? STATUS.FAILED : STATUS.OFFLINE,
      connected: false,
      retryCount: 0,
      retryTime: undefined,
      reason: options._permanent && options._error
        ? options._error
        : undefined,
    });
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
    if (this.currentStatus.status != STATUS.OFFLINE) this.reconnect();
  }

  _retryLater(maybeError) {
    var timeout = 0;
    if (this.options.retry ||
        maybeError === forcedReconnectError) {
      timeout = this._retry.retryLater(
        this.currentStatus.retryCount,
        this._retryNow.bind(this)
      );
      this._setStatus({
        status: STATUS.WAITING,
        connected: false,
        retryTime: new Date().getTime() + timeout,
      });
    } else {
      this._setStatus({
        status: STATUS.FAILED,
        connected: false,
        retryTime: undefined,
      });
    }
  }

  _retryNow() {
    if (this._forcedToDisconnect) return;

    this._setStatus({
      status: STATUS.CONNECTING,
      connected: false,
      retryCount: this.currentStatus.retryCount + 1,
      retryTime: undefined,
    });

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

StreamClientCommon.STATUSES = STATUS;
