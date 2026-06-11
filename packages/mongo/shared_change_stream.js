import { Meteor } from 'meteor/meteor';

/**
 * SharedChangeStream — one shared MongoDB change stream per collection.
 *
 * Every ChangeStreamObserveDriver on a collection watches the whole collection
 * (empty pipeline) with the same options (`fullDocument: 'updateLookup'`,
 * `fullDocumentBeforeChange: 'whenAvailable'`) and filters per-document via its
 * own matcher, so they share a single server-side cursor. This class opens one
 * `collection.watch()` and multicasts each raw change event, in-process, to
 * every subscribed driver — the same way the oplog driver shares a single tail
 * and dispatches via a crossbar.
 *
 * It owns the cursor lifecycle: an error or close triggers a restart that
 * resumes from the last resume token (`startAfter`), so events emitted while the
 * stream was reconnecting are replayed rather than dropped. A restart replaces
 * only the cursor; the subscribed drivers are left untouched.
 */
export class SharedChangeStream {
  constructor(mongoHandle, collectionName, onEmpty) {
    this._mongoHandle = mongoHandle;
    this._collectionName = collectionName;
    // Called when the last driver detaches so the owner (MongoConnection) can
    // drop us from its registry.
    this._onEmpty = onEmpty;

    this._drivers = new Set();
    this._changeStream = null;
    this._stopped = false;
    // Resume token of the last event we saw, so a restart replays everything
    // emitted while the stream was reconnecting instead of dropping it.
    this._resumeToken = null;
    // Promise of the in-flight open, so concurrent addDriver()/restart calls
    // for the same collection all await the same single watch() instead of
    // racing a second cursor into existence.
    this._startPromise = null;
    this._restartTimer = null;
  }

  get size() {
    return this._drivers.size;
  }

  // Subscribe a driver. Opens the shared stream on first subscriber. Resolves
  // once the stream is open so the driver can safely read its snapshot knowing
  // events emitted from here on are being queued for it.
  async addDriver(driver) {
    if (this._stopped) {
      throw new Error('SharedChangeStream used after stop');
    }
    this._drivers.add(driver);
    await this._ensureOpen();
  }

  // Open the shared stream if it isn't already open, coalescing concurrent
  // callers onto a single in-flight open. Setting _startPromise is synchronous
  // before any await, so two callers can never both start an _open().
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

  // Unsubscribe a driver. Closes the shared stream (and asks the owner to drop
  // us) once the last driver leaves.
  async removeDriver(driver) {
    this._drivers.delete(driver);
    if (this._drivers.size === 0) {
      await this._stop();
    }
  }

  async _open() {
    if (this._stopped) return;

    const collection = this._mongoHandle.rawCollection(this._collectionName);

    // Capture the cluster time BEFORE opening the stream so we can pass
    // startAtOperationTime to watch(). Without this, the change stream begins
    // at whatever time mongo processes the aggregate $changeStream command —
    // which under contention can be milliseconds later than the call site, and
    // any write that lands in that window is silently dropped. Skipped on
    // resume (the prior token already pins the start).
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

    // Always an empty pipeline so mongo delivers EVERY change event (including
    // drop/invalidate/rename). Events filtered out server-side would never
    // reach our handler, so _setLastProcessedOperationTime would not advance
    // for their clusterTime — while fence write paths annotate target ts from
    // session.operationTime including those dropped ops, leaving
    // _waitUntilCaughtUp pinned to a ts the stream can never reach. Per-document
    // selector filtering happens in each driver's matcher instead.
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
      if (this._stopped) return;
      console.error('ChangeStream error:', {
        collectionName: this._collectionName,
        driverCount: this._drivers.size,
        resumeTokenPresent: !!this._resumeToken,
        error,
      });
      this._scheduleRestart(
        Meteor?.settings?.packages?.mongo?.changeStream?.delay?.error || 100
      );
    }));

    changeStream.on('close', Meteor.bindEnvironment(() => {
      if (this._stopped) return;
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

    // Capture the resume token so a future restart picks up where this event
    // left off (see startAfter in _open).
    if (change && change._id) {
      this._resumeToken = change._id;
    }

    // Multicast the raw event to every subscribed driver. Each driver updates
    // its own lastProcessedOperationTime (for fence catch-up), runs its matcher
    // and projection, and queues/flushes its pending writes.
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
    console.error('ChangeStream restart begin:', {
      collectionName: this._collectionName,
      driverCount: this._drivers.size,
      resumeTokenPresent: !!this._resumeToken,
    });
    try {
      await this._closeStream();
      if (this._stopped) return;
      // Reopen through the shared guard so a driver subscribing mid-restart
      // awaits this same reopen instead of racing a second cursor.
      await this._ensureOpen();
      console.error('ChangeStream restart done:', {
        collectionName: this._collectionName,
        driverCount: this._drivers.size,
      });
    } catch (error) {
      console.error('Failed to restart ChangeStream:', {
        collectionName: this._collectionName,
        error,
      });
      // Try again so a single failed reopen doesn't permanently wedge the
      // shared stream for every driver on this collection.
      this._scheduleRestart(
        Meteor?.settings?.packages?.mongo?.changeStream?.delay?.error || 100
      );
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
    // Deregister from the connection BEFORE awaiting the cursor close. Otherwise
    // an observe on the same collection arriving during that await would acquire
    // this now-stopped multiplexer (addDriver would throw "used after stop")
    // instead of creating a fresh one.
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
