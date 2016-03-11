Tinytest.addAsync('census - maxSessions (callback)', (test, done) => {
  let onConnectListener = Meteor.onConnection((connection) => {
    onConnectListener.stop();

    connection.onClose(() => {
      Census.report((err, response) => {
        Census.stopSampling();

        let body = response.data.body;
        console.log(body);
        test.equal(body.properties.maxSessions, 1);

        done();
      });
    });
  });

  Census.startSampling();
  DDP.connect(process.env.ROOT_URL).disconnect();
});

Tinytest.addAsync('census - maxSessions (hook)', (test, done) => {
  let onConnectListener = Meteor.onConnection((connection) => {
    onConnectListener.stop();

    connection.onClose(() => {
      Census.report();

      let onReportListener = Census.report.onSuccess((response) => {
        onReportListener.stop();
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

Tinytest.addAsync('census - maxSessions zeroing', (test, done) => {
  // Should have had a single connection at the peak
  let primaryReport = () => {
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
  };

  // Should have had no connections at all
  let secondaryReport = () => {
    Census.report((err, response) => {
      let body = response.data.body;
      test.equal(body.properties.maxSessions, 0);
      done()
    });
  };

  primaryReport();
});