Tinytest.addAsync("asl-sync - synchronous queue", async function (test) {
  var q = new Meteor._AsynchronousQueue();
  var output = [];
  var pusher = function (n) {
    return function () {
      output.push(n);
    };
  };
  var outputIsUpTo = function (n) {
    var range = [];
    for (var i = 1; i <= n; ++i) {
      range.push(i);
    }
    test.equal(output, range);
  };

  // Queue a task. It cannot run until we yield.
  q.queueTask(pusher(1));
  outputIsUpTo(0);

  // Run another task async to be solved in the future.
  var runTask2Done = false;
  Meteor._runAsync(async function () {
    await q.runTask(pusher(2));
    runTask2Done = true;
  });
  outputIsUpTo(0);
  test.isFalse(runTask2Done);

  // Queue a third task. Still no outer yields, so still no runs.
  q.queueTask(function () {
    output.push(3);
    // This task gets queued once we actually start running functions, which
    // isn't until the runTask(pusher(4)), so it gets queued after Task #4.
    q.queueTask(pusher(5));
  });
  outputIsUpTo(0);
  test.isFalse(runTask2Done);

  // Run a task and block for it to be done. All queued tasks up to this one
  // will now be run.
  await q.runTask(pusher(4));
  outputIsUpTo(4);
  test.isTrue(runTask2Done);

  // Task #5 is still in the queue. Run another task synchronously.
  await q.runTask(pusher(6));
  outputIsUpTo(6);

  // Queue a task that throws. It'll write some debug output, but that's it.
  Meteor._suppress_log(1);
  q.queueTask(function () {
    throw new Error("bla");
  });
  // let it run.
  await q.runTask(pusher(7));
  outputIsUpTo(7);

  // Run a task that throws. It should throw from runTask.
  Meteor._suppress_log(1);
  await test.throwsAsync(async function () {
    await q.runTask(function () {
      throw new Error("this is thrown");
    });
  });
});
