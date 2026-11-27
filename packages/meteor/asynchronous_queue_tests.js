function queueTestGate() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

Tinytest.addAsync('async queue - parallel batches honor the concurrency limit', async test => {
  const queue = new Meteor._AsynchronousQueue({ orderMatters: false });
  queue._maxConcurrent = 2;
  queue._batchSize = 128;
  const gate = queueTestGate();
  const pairStarted = queueTestGate();
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 6 }, () => queue.runTask(async () => {
    active += 1;
    peak = Math.max(peak, active);
    if (active === 2) pairStarted.resolve();
    await gate.promise;
    active -= 1;
  }));
  try {
    await pairStarted.promise;
    test.equal(active, 2);
  } finally {
    gate.resolve();
    await Promise.all(tasks);
  }
  test.equal(peak, 2);
  test.equal(queue._activePromises.size, 0);
});

Tinytest.addAsync('async queue - rejected parallel tasks release tracking and allow later chunks', async test => {
  const queue = new Meteor._AsynchronousQueue({ orderMatters: false });
  queue._maxConcurrent = 2;
  const failure = new Error('expected task failure');
  const first = queue.runTask(async () => { throw failure; });
  const second = queue.runTask(async () => 'second');
  const third = queue.runTask(async () => 'third');
  const settled = await Promise.allSettled([first, second, third]);
  test.equal(settled[0].status, 'rejected');
  test.isTrue(settled[0].reason === failure);
  test.equal(settled[1].value, 'second');
  test.equal(settled[2].value, 'third');
  test.equal(queue._activePromises.size, 0);
  await queue.drain();
});
