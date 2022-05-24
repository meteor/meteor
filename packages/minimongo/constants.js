/** Exported values are also used in the mongo package. */

/** @param {string} method */
export function getAsyncMethodName(method) {
  return `${method.replace('_', '')}Async`;
}

export const ASYNC_COLLECTION_METHODS = [
  '_createCappedCollection',
  '_dropCollection',
  '_dropIndex',
  'createIndex',
  'findOne',
  'insert',
  'remove',
  'update',
  'upsert',
];

export const ASYNC_CURSOR_METHODS = ['count', 'fetch', 'forEach', 'map'];
