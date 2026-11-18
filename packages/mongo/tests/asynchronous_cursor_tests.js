import { AsynchronousCursor } from 'meteor/mongo/asynchronous_cursor';

Tinytest.addAsync('mongo - async cursor errors - collection reads reject query errors', async test => {
  const collection = new Mongo.Collection('cursor-errors-' + Random.id());
  const selector = { $foo: 1 };
  const isQueryError = error => error.name === 'MongoServerError' && error.code === 2;

  try {
    await collection.insertAsync({ value: 1 });
    await test.throwsAsync(() => collection.rawCollection().find(selector).toArray(), isQueryError);

    const reads = [
      () => collection.find(selector).fetchAsync(),
      () => collection.findOneAsync(selector),
      () => collection.find(selector).forEachAsync(() => test.fail('invalid query yielded a document')),
      () => collection.find(selector).mapAsync(doc => doc),
      async () => {
        for await (const doc of collection.find(selector)) {
          test.fail({ message: 'invalid query yielded a document', doc });
        }
      },
    ];
    for (const read of reads) {
      await test.throwsAsync(read, isQueryError);
    }

    test.equal(await collection.find({ value: 2 }).fetchAsync(), []);
    test.equal(await collection.findOneAsync({ value: 2 }), undefined);
  } finally {
    await collection.dropCollectionAsync();
  }
});

Tinytest.addAsync('mongo - async cursor errors - fetch rejects after a partial read', async test => {
  const error = new Error('read interrupted');
  let index = 0;
  const cursor = new AsynchronousCursor({
    rewind() { index = 0; },
    next() {
      return index++ === 0
        ? Promise.resolve({ _id: 'first' })
        : Promise.reject(error);
    },
  }, { options: {} }, {});

  await test.throwsAsync(() => cursor.fetch(), thrown => thrown === error);
  test.equal(cursor._pendingNext, null);
});

Tinytest.addAsync('mongo - async cursor errors - timed reads reject without an unhandled rejection', async test => {
  const error = new Error('tail read failed');
  const cursor = new AsynchronousCursor({
    next() { return Promise.reject(error); },
  }, { options: {} }, {});

  const unhandled = [];
  const onUnhandled = reason => {
    if (reason === error) unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    await test.throwsAsync(() => cursor._nextObjectPromiseWithTimeout(1000), thrown => thrown === error);
    test.equal(cursor._pendingNext, null);
    // Let detached promise rejections reach the runtime before checking.
    await new Promise(resolve => setImmediate(resolve));
    test.equal(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});
