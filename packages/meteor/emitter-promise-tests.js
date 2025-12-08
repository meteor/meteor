
Tinytest.addAsync(
  `emitter-promise - multiple events`,
  function (test, onComplete) {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      const expected = [];
      const { emitter, promise } = EmitterPromise.newPromiseResolver({});
      promise.then((res) => {
          expected.push(`P1-${res}`);
      });
      promises.push(promise);
      const { promise: promise2 } = EmitterPromise.newPromiseResolver({
        emitter,
      });
      promise2.then((res) => {
          expected.push(`P2-${res}`);
      });
      promises.push(Promise.all([promise, promise2]).then(() => {
          test.isTrue(expected.includes(`P1-${i}`));
          test.isTrue(expected.includes(`P2-${i}`));
      }));
      const randomTimeout = Math.ceil(Math.random() * 100);
      setTimeout(() => {
        emitter.emit('data', i);
      }, randomTimeout);
    }
    console.log();
    Promise.all(promises).then((results) => {
      onComplete();
    });
  }
);

Tinytest.addAsync(`emitter-promise - emit error`, function (test, onComplete) {
  const { emitter, promise } = EmitterPromise.newPromiseResolver({});
  const expectedError = new Meteor.Error('Error message.');
  promise.catch((err) => {
    test.isNotNull(err);
    test.equal(err, expectedError);
    test.equal(err.error, expectedError.error);
    onComplete();
  });
  setTimeout(() => {
    emitter.emit('error', expectedError);
  }, 20);
});

Tinytest.addAsync(
  `emitter-promise - timeout error`,
  function (test, onComplete) {
    const { emitter, promise } = EmitterPromise.newPromiseResolver({
      timeout: 500,
    });
    promise.catch((err) => {
      test.isNotNull(err);
      test.equal(err.error, 'EmitterPromise timeout: 500ms.');
      onComplete();
    });
    setTimeout(() => {
      emitter.emit('data', 'No data to emit.');
    }, 1000);
  }
);
