// import { DocFetcher } from "./doc_fetcher.js";
//
// testAsyncMulti("mongo-livedata - doc fetcher", [
//   async function (test, expect) {
//     var collName = "docfetcher-" + Random.id();
//     var collection = new Mongo.Collection(collName);
//     console.log('XXXXXXXXXXXXXXXXXXXXXXx');
//     var id1 = await collection.insertAsync({x: 1});
//     var id2 = await collection.insertAsync({y: 2});
//
//     var fetcher = new DocFetcher(
//       MongoInternals.defaultRemoteCollectionDriver().mongo);
//
//     // Test basic operation.
//     const fakeOp1 = {};
//     const fakeOp2 = {};
//       console.log('XXXXXXXXXXXXXXXXXXXXXXx');
//     await fetcher.fetch(collName, id1, fakeOp1).then(expect({_id: id1, x: 1}));
//
//       await fetcher.fetch(collName, "nonexistent!", fakeOp2).then(expect(null));
//     var fetched = false;
//     var fakeOp3 = {};
//     var expected = {_id: id2, y: 2};
//     // const promise1 = fetcher.fetch(collName, id2, fakeOp3).then(expect(function (d) {
//     //     fetched = true;
//     //     test.equal(d, expected);
//     // }));
//     test.isFalse(fetched);
//
//     // Now ask for another document with the same op reference. Because a
//     // fetch for that op is in flight, we will get the other fetch's
//     // document, not this random document.
//     //  const promise2 = fetcher.fetch(collName, Random.id(), fakeOp3).then(expect(function (d) {
//     //   test.equal(d, expected);
//     //  }));
//     //await Promise.all([promise1]);
//   }
// ]);
