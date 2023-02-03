export class DocFetcher {
  constructor(mongoConnection) {
    this._mongoConnection = mongoConnection;
    // Map from op -> [callback]
    this._callbacksForOp = new Map();
  }

  // Fetches document "id" from collectionName, returning it or null if not
  // found.
  //
  // If you make multiple calls to fetch() with the same op reference,
  // DocFetcher may assume that they all return the same document. (It does
  // not check to see if collectionName/id match.)
  //
  // You may assume that callback is never called synchronously (and in fact
  // OplogObserveDriver does so).
  async fetch(collectionName, id, op) {
    const self = this;

    check(collectionName, String);
    check(op, Object);

    // If there's already an in-progress fetch for this cache key, yield until
    // it's done and return whatever it returns.
    const inProgress = self._callbacksForOp.has(op);
    const em = self._callbacksForOp.get(op);
    const { promise: callback, emitter } = EmitterPromise.newPromiseResolver({
      emitter: em
    });
    if (!inProgress) {
      self._callbacksForOp.set(op, emitter);
    }

    if (inProgress) {
      return callback;
    }
    Meteor._runAsync(async function () {
      try {
        var doc = await self._mongoConnection.findOneAsync(
            collectionName, {_id: id}) || null;
        // Return doc to all relevant callbacks. Note that this array can
        // continue to grow during callback excecution.
        emitter.emit('data', doc);
      } catch (e) {
        emitter.emit('error', e);
      } finally {
        // XXX consider keeping the doc around for a period of time before
        // removing from the cache
        self._callbacksForOp.delete(op);
      }
    });
    return callback;
  }
}
