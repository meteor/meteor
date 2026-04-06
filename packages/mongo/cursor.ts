import { ASYNC_CURSOR_METHODS, getAsyncMethodName } from 'meteor/minimongo/constants';
import { replaceMeteorAtomWithMongo, replaceTypes } from './mongo_common';
import LocalCollection from 'meteor/minimongo/local_collection';
import { CursorDescription } from './cursor_description';
import { ObserveCallbacks, ObserveChangesCallbacks } from './types';

interface RawCollection {
  countDocuments: (selector: Record<string, unknown>, options: Record<string, unknown>) => Promise<number>;
}

interface SynchronousCursor {
  [key: string]: ((...args: unknown[]) => unknown);
  [Symbol.iterator]: () => Iterator<unknown>;
  [Symbol.asyncIterator]: () => AsyncIterator<unknown>;
}

interface MongoInterface {
  rawCollection: (collectionName: string) => RawCollection;
  _createAsynchronousCursor: (cursorDescription: CursorDescription, options: CursorOptions) => SynchronousCursor;
  _observeChanges: (cursorDescription: CursorDescription, ordered: boolean, callbacks: ObserveChangesCallbacks<unknown>, nonMutatingCallbacks?: boolean) => Promise<{ stop: () => void }>;
}

interface CursorOptions {
  selfForIteration: Cursor<unknown>;
  useTransform: boolean;
}

/**
 * @class Cursor
 *
 * The main cursor object returned from find(), implementing the documented
 * Mongo.Collection cursor API.
 *
 * Wraps a CursorDescription and lazily creates an AsynchronousCursor
 * (only contacts MongoDB when methods like fetch or forEach are called).
 */
export class Cursor<T, U = T> {
  public _mongo: MongoInterface;
  public _cursorDescription: CursorDescription;
  public _synchronousCursor: SynchronousCursor | null;

  constructor(mongo: MongoInterface, cursorDescription: CursorDescription) {
    this._mongo = mongo;
    this._cursorDescription = cursorDescription;
    this._synchronousCursor = null;
  }

  async countAsync(): Promise<number> {
    const collection = this._mongo.rawCollection(this._cursorDescription.collectionName);
    return await collection.countDocuments(
      replaceTypes(this._cursorDescription.selector, replaceMeteorAtomWithMongo),
      replaceTypes(this._cursorDescription.options, replaceMeteorAtomWithMongo),
    );
  }

  count(): never {
    throw new Error(
      "count() is not available on the server. Please use countAsync() instead."
    );
  }

  getTransform(): ((doc: Record<string, unknown>) => Record<string, unknown>) | undefined {
    return this._cursorDescription.options.transform;
  }

  _publishCursor(sub: { added: Function; changed: Function; removed: Function }): unknown {
    const collection = this._cursorDescription.collectionName;
    return Mongo.Collection._publishCursor(this, sub, collection);
  }

  _getCollectionName(): string {
    return this._cursorDescription.collectionName;
  }

  observe(callbacks: ObserveCallbacks<U>): unknown {
    return LocalCollection._observeFromObserveChanges(this, callbacks);
  }

  async observeAsync(callbacks: ObserveCallbacks<U>): Promise<unknown> {
    return new Promise(resolve => resolve(this.observe(callbacks)));
  }

  observeChanges(callbacks: ObserveChangesCallbacks<U>, options: { nonMutatingCallbacks?: boolean } = {}): Promise<{ stop: () => void }> {
    const ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);
    return this._mongo._observeChanges(
      this._cursorDescription,
      ordered,
      callbacks,
      options.nonMutatingCallbacks
    );
  }

  async observeChangesAsync(callbacks: ObserveChangesCallbacks<U>, options: { nonMutatingCallbacks?: boolean } = {}): Promise<{ stop: () => void }> {
    return this.observeChanges(callbacks, options);
  }
}

// Add cursor methods dynamically
[...ASYNC_CURSOR_METHODS, Symbol.iterator, Symbol.asyncIterator].forEach((methodName: string | symbol) => {
  if (methodName === 'count') return;

  (Cursor.prototype as Record<string | symbol, unknown>)[methodName] = function(this: Cursor<unknown>, ...args: unknown[]): unknown {
    const cursor = setupAsynchronousCursor(this, methodName);
    return cursor[methodName as string](...args);
  };

  if (methodName === Symbol.iterator || methodName === Symbol.asyncIterator) return;

  const methodNameAsync = getAsyncMethodName(methodName as string);

  (Cursor.prototype as Record<string | symbol, unknown>)[methodNameAsync] = function(this: Cursor<unknown>, ...args: unknown[]): unknown {
    return (this as Record<string, (...a: unknown[]) => unknown>)[methodName as string](...args);
  };
});

function setupAsynchronousCursor(cursor: Cursor<unknown>, method: string | symbol): SynchronousCursor {
  if (cursor._cursorDescription.options.tailable) {
    throw new Error(`Cannot call ${String(method)} on a tailable cursor`);
  }

  if (!cursor._synchronousCursor) {
    cursor._synchronousCursor = cursor._mongo._createAsynchronousCursor(
      cursor._cursorDescription,
      {
        selfForIteration: cursor,
        useTransform: true,
      }
    );
  }

  return cursor._synchronousCursor;
}