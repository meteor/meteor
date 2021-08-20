/**
 * Exported values are also used on mongo package.
 */

const MONGO_ASYNC_SUFFIX = 'Async';

export const getAsyncMethodName = method =>
  `${method}${MONGO_ASYNC_SUFFIX}`.replace('_', '');

export const CURSOR_METHODS = ['forEach', 'map', 'fetch', 'count'];
