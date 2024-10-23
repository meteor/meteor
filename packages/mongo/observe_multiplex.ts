import { ObserveHandle } from './observe_handle';
import isEmpty from 'lodash.isempty';

interface ObserveMultiplexerOptions {
  ordered: boolean;
  onStop?: () => void;
}

export type ObserveHandleCallback = 'added' | 'addedBefore' | 'changed' | 'movedBefore' | 'removed';

export class ObserveMultiplexer {
  private readonly _ordered: boolean;
  private readonly _onStop: () => void;
  private _queue: any;
  private _handles: { [key: string]: ObserveHandle } | null;
  private _resolver: ((value?: unknown) => void) | null;
  private readonly _readyPromise: Promise<boolean | void>;
  private _isReady: boolean;
  private _cache: any;
  private _addHandleTasksScheduledButNotPerformed: number;

  constructor({ ordered, onStop = () => {} }: ObserveMultiplexerOptions) {
    if (ordered === undefined) throw Error("must specify ordered");

    // @ts-ignore
    Package['facts-base'] && Package['facts-base']
        .Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", 1);

    this._ordered = ordered;
    this._onStop = onStop;
    // @ts-ignore
    this._queue = new Meteor._AsynchronousQueue();
    this._handles = {};
    this._resolver = null;
    this._isReady = false;
    this._readyPromise = new Promise(r => this._resolver = r).then(() => this._isReady = true);
    // @ts-ignore
    this._cache = new LocalCollection._CachingChangeObserver({ ordered });
    this._addHandleTasksScheduledButNotPerformed = 0;

    this.callbackNames().forEach(callbackName => {
      (this as any)[callbackName] = (...args: any[]) => {
        this._applyCallback(callbackName, args);
      };
    });
  }

  addHandleAndSendInitialAdds(handle: ObserveHandle): Promise<void> {
    return this._addHandleAndSendInitialAdds(handle);
  }

  async _addHandleAndSendInitialAdds(handle: ObserveHandle): Promise<void> {
    ++this._addHandleTasksScheduledButNotPerformed;

    // @ts-ignore
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
      "mongo-livedata", "observe-handles", 1);

    await this._queue.runTask(async () => {
      this._handles![handle._id] = handle;
      await this._sendAdds(handle);
      --this._addHandleTasksScheduledButNotPerformed;
    });
    await this._readyPromise;
  }

  async removeHandle(id: number): Promise<void> {
    if (!this._ready())
      throw new Error("Can't remove handles until the multiplex is ready");

    delete this._handles![id];

    // @ts-ignore
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
      "mongo-livedata", "observe-handles", -1);

    if (isEmpty(this._handles) &&
      this._addHandleTasksScheduledButNotPerformed === 0) {
      await this._stop();
    }
  }

  async _stop(options: { fromQueryError?: boolean } = {}): Promise<void> {
    if (!this._ready() && !options.fromQueryError)
      throw Error("surprising _stop: not ready");

    await this._onStop();

    // @ts-ignore
    Package['facts-base'] && Package['facts-base']
        .Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", -1);

    this._handles = null;
  }

  async ready(): Promise<void> {
    await this._queue.queueTask(() => {
      if (this._ready())
        throw Error("can't make ObserveMultiplex ready twice!");

      if (!this._resolver) {
        throw new Error("Missing resolver");
      }

      this._resolver();
      this._isReady = true;
    });
  }

  async queryError(err: Error): Promise<void> {
    await this._queue.runTask(() => {
      if (this._ready())
        throw Error("can't claim query has an error after it worked!");
      this._stop({ fromQueryError: true });
      throw err;
    });
  }

  async onFlush(cb: () => void): Promise<void> {
    await this._queue.queueTask(async () => {
      if (!this._ready())
        throw Error("only call onFlush on a multiplexer that will be ready");
      await cb();
    });
  }

  callbackNames(): ObserveHandleCallback[] {
    return this._ordered
      ? ["addedBefore", "changed", "movedBefore", "removed"]
      : ["added", "changed", "removed"];
  }

  _ready(): boolean {
    return !!this._isReady;
  }

  _applyCallback(callbackName: string, args: any[]): void {
    this._queue.queueTask(async () => {
      if (!this._handles) return;

      await this._cache.applyChange[callbackName].apply(null, args);
      if (!this._ready() &&
        (callbackName !== 'added' && callbackName !== 'addedBefore')) {
        throw new Error(`Got ${callbackName} during initial adds`);
      }

      for (const handleId of Object.keys(this._handles)) {
        const handle = this._handles && this._handles[handleId];
        if (!handle) return;
        const callback = (handle as any)[`_${callbackName}`];
        callback && (await callback.apply(
          null,
          handle.nonMutatingCallbacks ? args : EJSON.clone(args)
        ));
      }
    });
  }

  async _sendAdds(handle: ObserveHandle): Promise<void> {
    const add = this._ordered ? handle._addedBefore : handle._added;

    if (!add) return;

    await this._cache.docs.forEachAsync(async (doc: any, id: string) => {
      if (!(handle._id in this._handles!))
        throw Error("handle got removed before sending initial adds!");

      const { _id, ...fields } = handle.nonMutatingCallbacks ? doc : EJSON.clone(doc);

      if (this._ordered)
        await add(id, fields, null);
      else
        await add(id, fields);
    });
  }
}