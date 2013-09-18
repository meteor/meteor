var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');

Tinytest.add("mongo-livedata - doc fetcher", function (test) {
  var collName = "docfetcher-" + Random.id();
  var collection = new Meteor.Collection(collName);
  var id1 = collection.insert({x: 1});
  var id2 = collection.insert({y: 2});

  var fetcher = new MongoTest.DocFetcher(
    MongoInternals.defaultRemoteCollectionDriver().mongo);

  // Test basic operation.
  test.equal(fetcher.fetch(collName, id1, Random.id()),
             {_id: id1, x: 1});
  test.equal(fetcher.fetch(collName, "nonexistent!", Random.id()), null);

  var future = new Future;
  var fetched = false;
  var cacheKey = Random.id();
  Fiber(function () {
    var d = fetcher.fetch(collName, id2, cacheKey);
    fetched = true;
    future.return(d);
  }).run();
  // The fetcher yields:
  test.isFalse(fetched);

  // Now ask for another document with the same cache key. Because a fetch for
  // that cache key is in flight, we will get the other fetch's document, not
  // this random document.
  var doc2a = fetcher.fetch(collName, Random.id(), cacheKey);
  // Finally, wait for the original fetch to return:
  var doc2b = future.wait();
  var expected = {_id: id2, y: 2};
  test.equal(doc2a, expected);
  test.equal(doc2b, expected);
});
