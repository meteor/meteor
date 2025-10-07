import { ASYNC_CURSOR_METHODS, getAsyncMethodName } from 'meteor/minimongo/constants';
import { replaceMeteorAtomWithMongo, replaceTypes } from './mongo_common';
import LocalCollection from 'meteor/minimongo/local_collection';
import { CursorDescription } from './cursor_description';
import { ObserveCallbacks, ObserveChangesCallbacks } from './types';

interface MongoInterface {
  rawCollection: (collectionName: string) => any;
  _createAsynchronousCursor: (cursorDescription: CursorDescription, options: CursorOptions) => any;
  _observeChanges: (cursorDescription: CursorDescription, ordered: boolean, callbacks: any, nonMutatingCallbacks?: boolean) => any;
}

interface CursorOptions {
  selfForIteration: Cursor<any>;
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
  public _synchronousCursor: any | null;

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

  getTransform(): ((doc: any) => any) | undefined {
    return this._cursorDescription.options.transform;
  }

  _publishCursor(sub: any): any {
    const collection = this._cursorDescription.collectionName;
    return Mongo.Collection._publishCursor(this, sub, collection);
  }

  _getCollectionName(): string {
    return this._cursorDescription.collectionName;
  }

  observe(callbacks: ObserveCallbacks<U>): any {
    return LocalCollection._observeFromObserveChanges(this, callbacks);
  }

  async observeAsync(callbacks: ObserveCallbacks<U>): Promise<any> {
    return new Promise(resolve => resolve(this.observe(callbacks)));
  }

  observeChanges(callbacks: ObserveChangesCallbacks<U>, options: { nonMutatingCallbacks?: boolean } = {}): any {
    const ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);
    return this._mongo._observeChanges(
      this._cursorDescription,
      ordered,
      callbacks,
      options.nonMutatingCallbacks
    );
  }

  async observeChangesAsync(callbacks: ObserveChangesCallbacks<U>, options: { nonMutatingCallbacks?: boolean } = {}): Promise<any> {
    return this.observeChanges(callbacks, options);
  }
}

// Add cursor methods dynamically
[...ASYNC_CURSOR_METHODS, Symbol.iterator, Symbol.asyncIterator].forEach(methodName => {
  if (methodName === 'count') return;

  (Cursor.prototype as any)[methodName] = function(this: Cursor<any>, ...args: any[]): any {
    const cursor = setupAsynchronousCursor(this, methodName);
    return cursor[methodName](...args);
  };

  if (methodName === Symbol.iterator || methodName === Symbol.asyncIterator) return;

  const methodNameAsync = getAsyncMethodName(methodName);

  (Cursor.prototype as any)[methodNameAsync] = function(this: Cursor<any>, ...args: any[]): Promise<any> {
    return this[methodName](...args);
  };
});

function setupAsynchronousCursor(cursor: Cursor<any>, method: string | symbol): any {
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