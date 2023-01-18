//
// Tinytest.addAsync("asynchronous - queue", async function (test, onComplete) {
//   var q = new Meteor._AsynchronousQueue();
//   var output = [];
//   var pusher = function (n) {
//     return function () {
//       output.push(n);
//     };
//   };
//   var outputIsUpTo = function (n) {
//     var range = [];
//     for (var i = 1; i <= n; ++i) {
//       range.push(i);
//     }
//     test.equal(output, range);
//   };
//   const promises = [];
//   // Queue a task. It cannot run until we yield.
//   console.log('xxxx');
//    promises.push(q.queueTask(pusher(1)));
//
//   outputIsUpTo(0);
//   // Run another task. After queueing it, the fiber constructed here will yield
//   // back to this outer function. No task can have run yet since the main test
//   // fiber still will not have yielded.
//   // var runTask2Done = false;
//   // await q.runTask(pusher(2));
//   // runTask2Done = true;
//   // outputIsUpTo(0);
//   // test.isFalse(runTask2Done);
//
//   // Queue a third task. Still no outer yields, so still no runs.
//   promises.push(q.queueTask(function () {
//     output.push(3);
//     // This task gets queued once we actually start running functions, which
//     // isn't until the runTask(pusher(4)), so it gets queued after Task #4.
//     promises.push(q.queueTask(pusher(5)));
//   }));
//
//   console.log({promises});
//   outputIsUpTo(0);
//   test.isFalse(runTask2Done);
//
//   // Run a task and block for it to be done. All queued tasks up to this one
//   // will now be run.
//   await q.runTask(pusher(4));
//   outputIsUpTo(4);
//   test.isTrue(runTask2Done);
//
//   // Task #5 is still in the queue. Run another task synchronously.
//   await q.runTask(pusher(6));
//   outputIsUpTo(6);
//
//   // Queue a task that throws. It'll write some debug output, but that's it.
//   Meteor._suppress_log(1);
//   await q.queueTask(function () {
//     throw new Error("bla");
//   });
//   // let it run.
//   await q.runTask(pusher(7));
//   outputIsUpTo(7);
//
//   // Run a task that throws. It should throw from runTask.
//   Meteor._suppress_log(1);
//   test.throws(async function () {
//     try {
//       await q.runTask(function () {
//         throw new Error("this is thrown");
//       });
//     } catch (e) {
//       console.log({e});
//     }
//   });
// });
