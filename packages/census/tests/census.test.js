Tinytest.addAsync('census - maxSessions (callback)', (test, done) => {
  const onConnectListener = Meteor.onConnection((connection) => {
    onConnectListener.stop();

    connection.onClose(() => {
      Census.report((err, response) => {
        Census.stopSampling();

        const body = response.data.body;
        test.equal(body.properties.maxSessions, 1);

        done();
      });
    });
  });

  Census.startSampling();
  DDP.connect(process.env.ROOT_URL).disconnect();
});

Tinytest.addAsync('census - maxSessions (hook)', (test, done) => {
  const onConnectListener = Meteor.onConnection((connection) => {
    onConnectListener.stop();

    connection.onClose(() => {
      Census.report();

      const onReportListener = Census.report.onSuccess((response) => {
        onReportListener.stop();
        Census.stopSampling();

        const body = response.data.body;
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
  const primaryReport = () => {
    const onConnectListener = Meteor.onConnection((connection) => {
      onConnectListener.stop();

      connection.onClose(() => {
        Census.report((err, response) => {
          Census.stopSampling();

          const body = response.data.body;
          test.equal(body.properties.maxSessions);

          secondaryReport();
        });
      });
    });

    Census.startSampling();
    DDP.connect(process.env.ROOT_URL).disconnect();
  };

  // Should have had no connections at all
  const secondaryReport = () => {
    Census.report((err, response) => {
      const body = response.data.body;
      test.equal(body.properties.maxSessions, 0);
      done()
    });
  };

  primaryReport();
});