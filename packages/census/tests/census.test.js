Tinytest.addAsync('census - maxSessions (callback)', function(test, done) {
  let onConnectListener = Meteor.onConnection((connection) => {
    onConnectListener.stop();

    connection.onClose(() => {
      Census.report((err, response) => {
        Census.stopSampling();

        let body = response.data.body;
        test.equal(body.properties.maxSessions, 1);

        done();
      });
    });
  });

  Census.startSampling();
  DDP.connect(process.env.ROOT_URL).disconnect();
});

Tinytest.addAsync('census - maxSessions (event)', function(test, done) {
  let onConnectListener = Meteor.onConnection((connection) => {
    onConnectListener.stop();

    connection.onClose(() => {
      Census.report();

      Census.once('report:success', (response) => {
        Census.stopSampling();

        let body = response.data.body;
        test.equal(body.properties.maxSessions, 1);

        done();
      });
    });
  });

  Census.startSampling();
  DDP.connect(process.env.ROOT_URL).disconnect();
});

Tinytest.addAsync('census - maxSessions zeroing', function(test, done) {
  primaryReport();

  // Should have had a single collection at the peak
  function primaryReport() {
    let onConnectListener = Meteor.onConnection((connection) => {
      onConnectListener.stop();

      connection.onClose(() => {
        Census.report((err, response) => {
          Census.stopSampling();

          let body = response.data.body;
          test.equal(body.properties.maxSessions);

          secondaryReport();
        });
      });
    });

    Census.startSampling();
    DDP.connect(process.env.ROOT_URL).disconnect();
  }

  // Should have had no connections at all
  function secondaryReport() {
    Census.report((err, response) => {
      let body = response.data.body;
      test.equal(body.properties.maxSessions, 0);
      done()
    });
  }
});