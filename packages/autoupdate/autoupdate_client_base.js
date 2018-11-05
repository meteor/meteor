// Provides reactive status updates as an reactive dict.
//
// Status can be one of:
// "undefined": Autoupdate has been initialized but has not run yet
// "connecting": a subscription attempt is currently ongoing
// "uptodate": the current version matches the newest version
// "outdated": a newer version has been found
// "loading": the bundle is currently being downloaded (Cordova only)
// "waiting":
// a. either the latest version could not be fetched or
// b. downloading the bundle failed (Cordova only).
// In both cases a new check has been rescheduled.
//
// When status is in "waiting" state, "retryCount" describes the number of times
// a check has been tried while "retryTime" describes the estimated time of
// the next attempt. To turn "retryTime" into an interval until the next
// reconnection, use retryTime - (new Date()).getTime()
// Both values will be reset on a successful check ("uptodate" or "outdated")
// or when Autoupdate.retry() is manually called.

import { Retry } from "meteor/retry";
import { Tracker } from "meteor/tracker";
import { ClientVersions } from "./client_versions";

export class AutoUpdateBase {
  constructor(options = {}) {
    // Stores acceptable client versions.
    this._clientVersions = new ClientVersions();

    Meteor.connection.registerStore(
      "meteor_autoupdate_clientVersions",
      this._clientVersions.createStore()
    );

    this._appId = options.appId;

    this._retry = new Retry({
      // Unlike the stream reconnect use of Retry, which we want to be instant
      // in normal operation, this is a wacky failure. We don't want to retry
      // right away, we can start slowly.
      //
      // A better way than timeconstants here might be to use the knowledge
      // of when we reconnect to help trigger these retries. Typically, the
      // server fixing code will result in a restart and reconnect, but
      // potentially the subscription could have a transient error.
      minCount: 0, // don't do any immediate retries
      baseTimeout: 30 * 1000, // start with 30s
    });

    //// Reactive status
    this._currentStatus = {
      status: undefined,
      retryCount: 0,
      retryTime: undefined,
    };

    this._statusListeners = new Tracker.Dependency();
  }

  _statusChanged = () => {
    if (this._statusListeners) {
      this._statusListeners.changed();
    }
  };

  _setStatus(status) {
    if (status === this._currentStatus.status) return;
    this._currentStatus.status = status;
    // reset retryCount only on successful status updates
    if (status === 'outdated' || status === 'uptodate') {
      this._currentStatus.retryCount = 0;
    }
    this._currentStatus.retryTime = undefined;
    this._statusChanged();
  }

  _retryLater() {
    this._currentStatus.retryCount += 1;
    const timeout = this._retry.retryLater(
      this._currentStatus.retryCount,
      () => this._retrySubscription()
    );
    this._currentStatus.status = 'waiting';
    this._currentStatus.retryTime = new Date().getTime() + timeout;
    this._statusChanged();
  }

  newClientAvailable = () => {
    throw new Error('not implemented');
  };

  _onReady = () => {
    throw new Error('not implemented');
  };

  _onError = (error) => {
    Meteor._debug("autoupdate subscription failed", error);
    // Just retry making the subscription, don't reload the whole
    // page. While reloading would catch more cases (for example,
    // the server went back a version and is now doing old-style hot
    // code push), it would also be more prone to reload loops,
    // which look really bad to the user. Just retrying the
    // subscription over DDP means it is at least possible to fix by
    // updating the server.
    this._retryLater();
  };

  _retrySubscription() {
    this._currentStatus.status = 'connecting';
    this._currentStatus.retryTime = undefined;
    this._statusChanged();
    this.handle = Meteor.subscribe(
      "meteor_autoupdate_clientVersions",
      this._appId,
      {
        onError: this._onError,
        onReady: this._onReady,
      })
  }

  // Get current status. Reactive.
  status = () => {
    if (this._statusListeners) {
      this._statusListeners.depend();
    }
    return this._currentStatus;
  };

  // only allow retries when a check is currently waiting to be retried,
  // i.e. this method will short circuit the waiting process
  retry() {
    if (this._currentStatus.status === 'waiting') {
      if (this.handle) this.handle.stop();
      this._retry.clear();
      // since this function is called manually reset retry related states
      this._currentStatus.retryCount = 0;
      this._currentStatus.retryTime = undefined;
      this._statusChanged();
      return true;
    }

    return false;
  }
}
