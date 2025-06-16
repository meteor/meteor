/**
 * @summary Watches the MongoDB collection using Change Streams.
 * @locus Server
 * @memberof Mongo.Collection
 * @instance
 * @param {Array} [pipeline] Optional aggregation pipeline to filter Change Stream events.
 * @param {Object} [options] Optional settings for the Change Stream.
 * @returns {ChangeStream} The MongoDB ChangeStream instance.
 * @throws {Error} If called on a client/minimongo collection.
 *
 * @example
 *   const changeStream = MyCollection.watch([
 *     { $match: { 'operationType': 'insert' } }
 *   ]);
 *   changeStream.on('change', (change) => {
 *     console.log('Change detected:', change);
 *   });
 */

export function watch(pipeline = [], options = {}) {
  // Only available on server
  if (typeof Package === 'undefined' || !this.rawCollection) {
    throw new Error('watch is only available on server collections');
  }
  const raw = this.rawCollection();
  if (!raw.watch) {
    throw new Error('Underlying collection does not support watch (Change Streams)');
  }
  console.log('[watch] raw.watch() pipeline:', JSON.stringify(pipeline, null, 2), ' | options:', JSON.stringify(options, null, 2));
  return raw.watch(pipeline, options);
}
