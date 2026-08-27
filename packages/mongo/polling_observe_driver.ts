import throttle from 'lodash.throttle';
import { listenAll } from './mongo_driver';
import { ObserveMultiplexer } from './observe_multiplex';

interface PollingObserveDriverOptions {
  cursorDescription: any;
  mongoHandle: any;
  ordered: boolean;
  multiplexer: ObserveMultiplexer;
  _testOnlyPollCallback?: () => void;
}

const POLLING_THROTTLE_MS = +(process.env.METEOR_POLLING_THROTTLE_MS || '') || 50;
const POLLING_INTERVAL_MS = +(process.env.METEOR_POLLING_INTERVAL_MS || '') || 10 * 1000;

/**
 * @class PollingObserveDriver
 *
 * One of two observe driver implementations.
 *
 * Characteristics:
 * - Caches the results of a query
 * - Reruns the query when necessary
 * - Suitable for cases where oplog tailing is not available or practical
 */
export class PollingObserveDriver {
  private _options: PollingObserveDriverOptions;
  private _cursorDescription: any;
  private _mongoHandle: any;
  private _ordered: boolean;
  private _multiplexer: any;
  private _stopCallbacks: Array<() => Promise<void>>;
  private _stopped: boolean;
  private _cursor: any;
  private _results: any;
  private _pollsScheduledButNotStarted: number;
  private _pendingWrites: any[];
  private _ensurePollIsScheduled: Function;
  private _taskQueue: any;
  private _testOnlyPollCallback?: () => void;

  constructor(options: PollingObserveDriverOptions) {
    this._options = options;
    this._cursorDescription = options.cursorDescription;
    this._mongoHandle = options.mongoHandle;
    this._ordered = options.ordered;
    this._multiplexer = options.multiplexer;
    this._stopCallbacks = [];
    this._stopped = false;

    this._cursor = this._mongoHandle._createAsynchronousCursor(
      this._cursorDescription);

    this._results = null;
    this._pollsScheduledButNotStarted = 0;
    this._pendingWrites = [];

    this._ensurePollIsScheduled = throttle(
      this._unthrottledEnsurePollIsScheduled.bind(this),
      this._cursorDescription.options.pollingThrottleMs || POLLING_THROTTLE_MS
    );

    this._taskQueue = new (Meteor as any)._AsynchronousQueue();
  }

  async _init(): Promise<void> {
    const options = this._options;
    const listenersHandle = await listenAll(
      this._cursorDescription,
      (notification: any) => {
        const fence = (DDPServer as any)._getCurrentFence();
        if (fence) {
          this._pendingWrites.push(fence.beginWrite());
        }
        if (this._pollsScheduledButNotStarted === 0) {
          this._ensurePollIsScheduled();
        }
      }
    );

    this._stopCallbacks.push(async () => { await listenersHandle.stop(); });

    if (options._testOnlyPollCallback) {
      this._testOnlyPollCallback = options._testOnlyPollCallback;
    } else {
      const pollingInterval =
        this._cursorDescription.options.pollingIntervalMs ||
        this._cursorDescription.options._pollingInterval ||
        POLLING_INTERVAL_MS;

      const intervalHandle = Meteor.setInterval(
        this._ensurePollIsScheduled.bind(this),
        pollingInterval
      );

      this._stopCallbacks.push(() => {
        Meteor.clearInterval(intervalHandle);
      });
    }

    await this._unthrottledEnsurePollIsScheduled();

    (Package['facts-base'] as any)?.Facts.incrementServerFact(
      "mongo-livedata", "observe-drivers-polling", 1);
  }

  async _unthrottledEnsurePollIsScheduled(): Promise<void> {
    if (this._pollsScheduledButNotStarted > 0) return;
    ++this._pollsScheduledButNotStarted;
    await this._taskQueue.runTask(async () => {
      await this._pollMongo();
    });
  }

  _suspendPolling(): void {
    ++this._pollsScheduledButNotStarted;
    this._taskQueue.runTask(() => {});

    if (this._pollsScheduledButNotStarted !== 1) {
      throw new Error(`_pollsScheduledButNotStarted is ${this._pollsScheduledButNotStarted}`);
    }
  }

  async _resumePolling(): Promise<void> {
    if (this._pollsScheduledButNotStarted !== 1) {
      throw new Error(`_pollsScheduledButNotStarted is ${this._pollsScheduledButNotStarted}`);
    }
    await this._taskQueue.runTask(async () => {
      await this._pollMongo();
    });
  }

  async _pollMongo(): Promise<void> {
    --this._pollsScheduledButNotStarted;

    if (this._stopped) return;

    let first = false;
    let newResults;
    let oldResults = this._results;

    if (!oldResults) {
      first = true;
      oldResults = this._ordered ? [] : new (LocalCollection as any)._IdMap;
    }

    this._testOnlyPollCallback?.();

    const writesForCycle = this._pendingWrites;
    this._pendingWrites = [];

    try {
      newResults = await this._cursor.getRawObjects(this._ordered);
    } catch (e: any) {
      if (first && typeof(e.code) === 'number') {
        await this._multiplexer.queryError(
          new Error(
            `Exception while polling query ${
              JSON.stringify(this._cursorDescription)
            }: ${e.message}`
          )
        );
      }

      Array.prototype.push.apply(this._pendingWrites, writesForCycle);
      Meteor._debug(`Exception while polling query ${
        JSON.stringify(this._cursorDescription)}`, e);
      return;
    }

    if (!this._stopped) {
      (LocalCollection as any)._diffQueryChanges(
        this._ordered, oldResults, newResults, this._multiplexer);
    }

    if (first) this._multiplexer.ready();

    this._results = newResults;

    await this._multiplexer.onFlush(async () => {
      for (const w of writesForCycle) {
        await w.committed();
      }
    });
  }

  async stop(): Promise<void> {
    this._stopped = true;

    for (const callback of this._stopCallbacks) {
      await callback();
    }

    for (const w of this._pendingWrites) {
      await w.committed();
    }

    (Package['facts-base'] as any)?.Facts.incrementServerFact(
      "mongo-livedata", "observe-drivers-polling", -1);
  }
}