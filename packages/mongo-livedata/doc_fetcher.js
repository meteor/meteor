var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');

DocFetcher = function (mongoConnection) {
  var self = this;
  self._mongoConnection = mongoConnection;
  // Map from cache key -> [callback]
  self._callbacksForCacheKey = {};
};

_.extend(DocFetcher.prototype, {
  // Fetches document "id" from collectionName, returning it or null if not
  // found.
  //
  // If you make multiple calls to fetch() with the same cacheKey (a string),
  // DocFetcher may assume that they all return the same document. (It does
  // not check to see if collectionName/id match.)
  //
  // You may assume that callback is never called synchronously (and in fact
  // OplogObserveDriver does so).
  fetch: function (collectionName, id, cacheKey, callback) {
    var self = this;

    check(collectionName, String);
    // id is some sort of scalar
    check(cacheKey, String);

    // If there's already an in-progress fetch for this cache key, yield until
    // it's done and return whatever it returns.
    if (_.has(self._callbacksForCacheKey, cacheKey)) {
      self._callbacksForCacheKey[cacheKey].push(callback);
      return;
    }

    var callbacks = self._callbacksForCacheKey[cacheKey] = [callback];

    Fiber(function () {
      try {
        var doc = self._mongoConnection.findOne(
          collectionName, {_id: id}) || null;
        // Return doc to all relevant callbacks. Note that this array can
        // continue to grow during callback excecution.
        while (!_.isEmpty(callbacks)) {
          // Clone the document so that the various calls to fetch don't return
          // objects that are intertwingled with each other. Clone before
          // popping the future, so that if clone throws, the error gets passed
          // to the next callback.
          var clonedDoc = EJSON.clone(doc);
          callbacks.pop()(null, clonedDoc);
        }
      } catch (e) {
        while (!_.isEmpty(callbacks)) {
          callbacks.pop()(e);
        }
      } finally {
        // XXX consider keeping the doc around for a period of time before
        // removing from the cache
        delete self._callbacksForCacheKey[cacheKey];
      }
    }).run();
  }
});

MongoTest.DocFetcher = DocFetcher;
