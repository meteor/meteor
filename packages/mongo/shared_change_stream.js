import { Meteor } from 'meteor/meteor';

/**
 * SharedChangeStream — one MongoDB change stream shared per collection.
 *
 * Every driver on a collection watches the whole collection with identical
 * options and filters per-document in its own matcher, so they can share one
 * server-side cursor. This opens a single collection.watch() and multicasts each
 * raw event in-process to every subscribed driver — like the oplog driver
 * sharing one tail via a crossbar.
 *
 * It owns the cursor lifecycle: an error/close restarts from the last resume
 * token (startAfter), replaying events missed while reconnecting. A resumable
 * restart replaces only the cursor; drivers are untouched. A NON-resumable error
 * (the token aged out of the oplog) instead drops the token, reopens from a fresh
 * start time, and reconciles each driver with the collection for the events lost
 * during the gap (see _restart / _resyncDrivers).
 */
export class SharedChangeStream {
  constructor(mongoHandle, collectionName, onEmpty) {
    this._mongoHandle = mongoHandle;
    this._collectionName = collectionName;
    // Called when the last driver detaches so the owner can deregister us.
    this._onEmpty = onEmpty;

    this._drivers = new Set();
    this._changeStream = null;
    this._stopped = false;
    // Last seen resume token; a restart replays from here (startAfter).
    this._resumeToken = null;
    // In-flight open, so concurrent callers share one watch() instead of
    // racing a second cursor.
    this._startPromise = null;
    this._restartTimer = null;
    // Set when a restart is triggered by a non-resumable error so the reopened
    // stream reconciles its drivers with the collection (see _restart).
    this._historyLost = false;
    // Serialize _restart: a second error firing on the freshly reopened cursor
    // while the previous restart is still awaiting its reconcile must not run a
    // second restart (and a second resync) concurrently. It coalesces into one
    // follow-up run via _restartRequested instead.
    this._restarting = false;
    this._restartRequested = false;
    // Consecutive failed reopens; grows the retry delay so a persistently broken
    // stream (e.g. mid-shutdown) backs off instead of spinning ~10x/sec.
    this._restartFailures = 0;
  }

  get size() {
    return this._drivers.size;
  }

  // Subscribe a driver, opening the stream on the first one. Resolves once open
  // so the driver can read its snapshot knowing events are now queued for it.
  async addDriver(driver) {
    if (this._stopped) {
      throw new Error('SharedChangeStream used after stop');
    }
    this._drivers.add(driver);
    await this._ensureOpen();
  }

  // Open if needed, coalescing concurrent callers onto one in-flight open.
  // _startPromise is set synchronously before any await, so no double open.
  _ensureOpen() {
    if (this._changeStream || this._stopped) {
      return Promise.resolve();
    }
    if (!this._startPromise) {
      this._startPromise = this._open().finally(() => {
        this._startPromise = null;
      });
    }
    return this._startPromise;
  }

  // Unsubscribe a driver; tear down once the last one leaves.
  async removeDriver(driver) {
    this._drivers.delete(driver);
    if (this._drivers.size === 0) {
      await this._stop();
    }
  }

  async _open() {
    if (this._stopped) return;

    const collection = this._mongoHandle.rawCollection(this._collectionName);

    // Pin the start time before opening: otherwise the stream begins whenever
    // mongo processes the $changeStream command, and writes landing in that gap
    // are dropped. Skipped on resume (the token already pins the start).
    let startAtOperationTime;
    if (!this._resumeToken) {
      try {
        const pingRes = await this._mongoHandle.db.command({ ping: 1 });
        startAtOperationTime = pingRes?.operationTime;
      } catch (e) {
        // Best-effort; falls back to mongo's default of "now".
      }
    }

    if (this._stopped) return;

    // Empty pipeline so mongo delivers EVERY event: a server-side filter would
    // skip events, so _setLastProcessedOperationTime wouldn't advance for their
    // clusterTime while the fence still targets it — wedging _waitUntilCaughtUp.
    // Per-document filtering happens in each driver's matcher instead.
    const changeStreamOptions = {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
    };
    if (this._resumeToken) {
      changeStreamOptions.startAfter = this._resumeToken;
    } else if (startAtOperationTime) {
      changeStreamOptions.startAtOperationTime = startAtOperationTime;
    }

    const changeStream = collection.watch([], changeStreamOptions);
    this._changeStream = changeStream;

    changeStream.on('change', Meteor.bindEnvironment((change) => {
      this._onChange(change);
    }));

    changeStream.on('error', Meteor.bindEnvironment((error) => {
      // Only the active stream restarts; ignore a superseded one.
      if (this._stopped || this._changeStream !== changeStream) return;
      console.error('ChangeStream error:', {
        collectionName: this._collectionName,
        driverCount: this._drivers.size,
        resumeTokenPresent: !!this._resumeToken,
        error,
      });
      // A non-resumable error means the resume token is no longer in the oplog,
      // so watch() reopens but every getMore fails with the same error again —
      // an endless error→restart loop that re-sends the dead token. Drop the
      // token so the restart falls back to startAtOperationTime (now), and flag
      // the stream so the reopened cursor reconciles its drivers: events in the
      // lost window were never delivered.
      if (this._isNonResumableError(error)) {
        this._resumeToken = null;
        this._historyLost = true;
      }
      this._scheduleRestart(
        Meteor?.settings?.packages?.mongo?.changeStream?.delay?.error || 100
      );
    }));

    changeStream.on('close', Meteor.bindEnvironment(() => {
      // _closeStream() replaces this._changeStream before closing, so a
      // deliberate close fails this check and won't loop into a restart.
      if (this._stopped || this._changeStream !== changeStream) return;
      console.error('ChangeStream closed unexpectedly, scheduling restart:', {
        collectionName: this._collectionName,
        driverCount: this._drivers.size,
        resumeTokenPresent: !!this._resumeToken,
      });
      this._scheduleRestart(
        Meteor?.settings?.packages?.mongo?.changeStream?.delay?.close || 100
      );
    }));
  }

  _onChange(change) {
    if (this._stopped) return;

    // Remember the resume token so a restart picks up here (see _open).
    if (change && change._id) {
      this._resumeToken = change._id;
    }

    // Multicast to every driver; each runs its own matcher/projection, advances
    // its lastProcessedOperationTime, and flushes pending writes.
    for (const driver of this._drivers) {
      if (driver._stopped) continue;
      try {
        driver._onChange(change);
      } catch (error) {
        console.error('[ChangeStreams] Error dispatching change to driver:', {
          driverId: driver._id,
          collectionName: this._collectionName,
          error,
        });
      }
    }
  }

  // A change stream is non-resumable when the resume point has aged out of the
  // oplog (ChangeStreamHistoryLost, code 286), or more generally when the driver
  // surfaces an error it could not resume from. The mongo driver retries
  // resumable errors internally and only emits an 'error' event once it gives up,
  // tagging still-recoverable errors with the ResumableChangeStreamError label —
  // so an emitted error WITHOUT that label cannot be resumed from the stored
  // token either. (Note: there is no 'NonResumableChangeStreamError' label in the
  // driver; only the positive ResumableChangeStreamError exists.) Resuming from
  // the stored token can never succeed for these, so restart from a fresh time.
  _isNonResumableError(error) {
    if (!error) return false;
    if (error.code === 286 || error.codeName === 'ChangeStreamHistoryLost') {
      return true;
    }
    const resumableLabel = 'ResumableChangeStreamError';
    if (typeof error.hasErrorLabel === 'function') {
      return !error.hasErrorLabel(resumableLabel);
    }
    if (error.errorLabelSet && typeof error.errorLabelSet.has === 'function') {
      return !error.errorLabelSet.has(resumableLabel);
    }
    if (Array.isArray(error.errorLabels)) {
      return !error.errorLabels.includes(resumableLabel);
    }
    // No label information to reason about; keep the pre-existing conservative
    // behavior and treat it as resumable (restart re-sends the token).
    return false;
  }

  _scheduleRestart(delayMs) {
    if (this._stopped || this._restartTimer) return;
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;
      if (!this._stopped) {
        this._restart();
      }
    }, delayMs);
  }

  async _restart() {
    if (this._stopped) return;
    // Only one restart runs at a time. A second non-resumable error can fire on
    // the freshly reopened cursor while we are still awaiting _resyncDrivers();
    // running _restart again concurrently would race two resyncs on the same
    // drivers. Coalesce it into a single follow-up run (see the finally below).
    if (this._restarting) {
      this._restartRequested = true;
      return;
    }
    this._restarting = true;
    console.error('ChangeStream restart begin:', {
      collectionName: this._collectionName,
      driverCount: this._drivers.size,
      resumeTokenPresent: !!this._resumeToken,
    });
    try {
      await this._closeStream();
      if (this._stopped) return;
      // Reopen via the shared guard so a mid-restart subscriber awaits it too.
      await this._ensureOpen();
      // The reopened cursor starts at "now", so bring each driver's result set
      // back in sync with the collection for the events it never received. Only
      // clear the flag once the reopen succeeds, so a failed reopen that
      // reschedules still reconciles on the retry.
      if (this._historyLost && !this._stopped) {
        this._historyLost = false;
        await this._resyncDrivers();
      }
      this._restartFailures = 0;
      console.error('ChangeStream restart done:', {
        collectionName: this._collectionName,
        driverCount: this._drivers.size,
      });
    } catch (error) {
      console.error('Failed to restart ChangeStream:', {
        collectionName: this._collectionName,
        error,
      });
      // Retry so one failed reopen doesn't wedge the stream for all drivers, but
      // back off on repeated failures so a stream that cannot reopen (e.g. during
      // topology teardown) doesn't spin.
      this._restartFailures += 1;
      const base =
        Meteor?.settings?.packages?.mongo?.changeStream?.delay?.error || 100;
      const delay = Math.min(base * 2 ** (this._restartFailures - 1), 5000);
      this._scheduleRestart(delay);
    } finally {
      this._restarting = false;
      // A restart requested mid-flight (e.g. a second history-lost error) still
      // needs to run now that this one has settled.
      if (this._restartRequested && !this._stopped) {
        this._restartRequested = false;
        this._scheduleRestart(0);
      }
    }
  }

  // Reconcile every attached driver with the collection after a non-resumable
  // gap. Best-effort and isolated per driver: a failed reconcile is logged, not
  // rethrown, so it can never wedge or re-loop the stream that just recovered.
  async _resyncDrivers() {
    for (const driver of [...this._drivers]) {
      if (this._stopped) return;
      if (driver._stopped) continue;
      try {
        await driver._resyncAfterHistoryLost();
      } catch (error) {
        console.error('ChangeStream resync after history loss failed:', {
          collectionName: this._collectionName,
          driverId: driver._id,
          error,
        });
      }
    }
  }

  async _closeStream() {
    const stream = this._changeStream;
    this._changeStream = null;
    if (stream) {
      try {
        await stream.close();
      } catch (error) {
        // Ignore errors when closing.
      }
    }
  }

  async _stop() {
    if (this._stopped) return;
    this._stopped = true;
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    // Deregister before awaiting close, else an observe arriving during the
    // await would acquire this stopped stream (addDriver throws) not a fresh one.
    if (typeof this._onEmpty === 'function') {
      try {
        this._onEmpty();
      } catch (e) {
        // Ignore registry-cleanup errors.
      }
    }
    await this._closeStream();
  }
}
