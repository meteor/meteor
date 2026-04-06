import throttle from 'lodash.throttle';
import { listenAll } from './mongo_driver';
import { ObserveMultiplexer } from './observe_multiplex';
import { CursorDescription } from './cursor_description';
import { MongoConnection } from './mongo_connection';

interface WriteHandle {
  committed: () => Promise<void>;
}

interface AsyncQueue {
  runTask: (fn: () => void | Promise<void>) => Promise<void>;
}

interface PollingObserveDriverOptions {
  cursorDescription: CursorDescription;
  mongoHandle: MongoConnection;
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
  private _cursorDescription: CursorDescription;
  private _mongoHandle: MongoConnection;
  private _ordered: boolean;
  private _multiplexer: ObserveMultiplexer;
  private _stopCallbacks: Array<() => void | Promise<void>>;
  private _stopped: boolean;
  private _cursor: { getRawObjects: (ordered: boolean) => Promise<unknown> };
  private _results: unknown;
  private _pollsScheduledButNotStarted: number;
  private _pendingWrites: WriteHandle[];
  private _ensurePollIsScheduled: (() => void) & { cancel?: () => void };
  private _taskQueue: AsyncQueue;
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

    this._taskQueue = new (Meteor as unknown as { _AsynchronousQueue: new () => AsyncQueue })._AsynchronousQueue();
  }

  async _init(): Promise<void> {
    const options = this._options;
    const listenersHandle = await listenAll(
      this._cursorDescription,
      (_notification: Record<string, unknown>) => {
        const fence: { beginWrite: () => WriteHandle } | null = (DDPServer as unknown as { _getCurrentFence: () => { beginWrite: () => WriteHandle } | null })._getCurrentFence();
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

    (Package['facts-base'] as { Facts?: { incrementServerFact: (pkg: string, fact: string, val: number) => void } } | undefined)?.Facts?.incrementServerFact(
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
    let newResults: unknown;
    let oldResults = this._results;

    if (!oldResults) {
      first = true;
      oldResults = this._ordered ? [] : new (LocalCollection as unknown as { _IdMap: new () => Map<string, unknown> })._IdMap;
    }

    this._testOnlyPollCallback?.();

    const writesForCycle = this._pendingWrites;
    this._pendingWrites = [];

    try {
      newResults = await this._cursor.getRawObjects(this._ordered);
    } catch (e: unknown) {
      const err = e as { code?: number; message?: string };
      if (first && typeof(err.code) === 'number') {
        await this._multiplexer.queryError(
          new Error(
            `Exception while polling query ${
              JSON.stringify(this._cursorDescription)
            }: ${err.message}`
          )
        );
      }

      Array.prototype.push.apply(this._pendingWrites, writesForCycle);
      Meteor._debug(`Exception while polling query ${
        JSON.stringify(this._cursorDescription)}`, e);
      return;
    }

    if (!this._stopped) {
      (LocalCollection as unknown as { _diffQueryChanges: (ordered: boolean, oldResults: unknown, newResults: unknown, multiplexer: ObserveMultiplexer) => void })._diffQueryChanges(
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

    (Package['facts-base'] as { Facts?: { incrementServerFact: (pkg: string, fact: string, val: number) => void } } | undefined)?.Facts?.incrementServerFact(
      "mongo-livedata", "observe-drivers-polling", -1);
  }
}