var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');
import { DocFetcher } from "./doc_fetcher.js";

testAsyncMulti("mongo-livedata - doc fetcher", [
  function (test, expect) {
    var self = this;
    var collName = "docfetcher-" + Random.id();
    var collection = new Mongo.Collection(collName);
    var id1 = collection.insert({x: 1});
    var id2 = collection.insert({y: 2});

    var fetcher = new DocFetcher(
      MongoInternals.defaultRemoteCollectionDriver().mongo);

    // Test basic operation.
    const fakeOp1 = {};
    const fakeOp2 = {};
    fetcher.fetch(collName, id1, fakeOp1, expect(null, {_id: id1, x: 1}));
    fetcher.fetch(collName, "nonexistent!", fakeOp2, expect(null, null));

    var fetched = false;
    var fakeOp3 = {};
    var expected = {_id: id2, y: 2};
    fetcher.fetch(collName, id2, fakeOp3, expect(function (e, d) {
      fetched = true;
      test.isFalse(e);
      test.equal(d, expected);
    }));
    // The fetcher yields.
    test.isFalse(fetched);

    // Now ask for another document with the same op reference. Because a
    // fetch for that op is in flight, we will get the other fetch's
    // document, not this random document.
    fetcher.fetch(collName, Random.id(), fakeOp3, expect(function (e, d) {
      test.isFalse(e);
      test.equal(d, expected);
    }));
  }
]);
