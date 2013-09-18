var Future = Npm.require('fibers/future');

DocFetcher = function (mongoConnection) {
  var self = this;
  self._mongoConnection = mongoConnection;
  // Map from cache key -> [Future]
  self._futuresForCacheKey = {};
};

_.extend(DocFetcher.prototype, {
  // Fetches document "id" from collectionName, returning it or null if not
  // found. Throws other errors. Can yield.
  //
  // If you make multiple calls to fetch() with the same cacheKey (a string),
  // DocFetcher may assume that they all return the same document. (It does
  // not check to see if collectionName/id match.)
  fetch: function (collectionName, id, cacheKey) {
    var self = this;

    check(collectionName, String);
    // id is some sort of scalar
    check(cacheKey, String);

    // If there's already an in-progress fetch for this cache key, yield until
    // it's done and return whatever it returns.
    if (_.has(self._futuresForCacheKey, cacheKey)) {
      var f = new Future;
      self._futuresForCacheKey.push(f);
      return f.wait();
    }

    var futures = self._futuresForCacheKey[cacheKey] = [];

    try {
      var doc = self._mongoConnection.findOne(
        collectionName, {_id: id}) || null;
      // Return doc to all fibers that are blocking on us. Note that this array
      // can continue to grow during calls to Future.return.
      while (!_.isEmpty(futures)) {
        // Clone the document so that the various calls to fetch don't return
        // objects that are intertwingled with each other. Clone before popping
        // the future, so that if clone throws, the error gets thrown to the
        // next future instead of that fiber hanging.
        var clonedDoc = EJSON.clone(doc);
        futures.pop().return(clonedDoc);
      }
    } catch (e) {
      while (!_.isEmpty(futures)) {
        futures.pop().throw(e);
      }
      throw e;
    } finally {
      // XXX consider keeping the doc around for a period of time before
      // removing from the cache
      delete self._futuresForCacheKey[cacheKey];
    }

    return doc;
  }
});
