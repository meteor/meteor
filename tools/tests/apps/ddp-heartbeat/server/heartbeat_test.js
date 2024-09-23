const waitReactive = (fn) => {
  return new Promise((resolve, reject) => {
    let timeoutHandle = setTimeout(() => {
      reject(new Error("timeout"));
    }, 60000);
    let computation = Tracker.autorun((c) => {
      let ret = fn();
      if (ret) {
        c.stop();
        clearTimeout(timeoutHandle);
        Meteor.defer(() => {
          resolve(ret);
        });
      }
    });
  });
};

const waitForClientConnectionStatus = (connection, status) => {
  return waitReactive(() => connection.status().status === status);
};

const expectConnectAndReconnect = async (clientConnection) => {
  console.log("client is connecting");
  await waitForClientConnectionStatus(clientConnection, "connected");

  console.log("client is connected, expecting ping timeout and reconnect");
  await waitForClientConnectionStatus(clientConnection, "connecting");

  console.log("client is reconnecting");
};

const testClientTimeout = async () => {
  console.log("Test client timeout");

  let savedServerOptions = { ...Meteor.server.options };
  Meteor.server.options.heartbeatInterval = 0;
  Meteor.server.options.respondToPings = false;

  let clientConnection = DDP.connect(Meteor.absoluteUrl());

  await expectConnectAndReconnect(clientConnection);

  clientConnection.close();

  Meteor.server.options = savedServerOptions;

  console.log("test successful\n");
};

const testServerTimeout = async () => {
  console.log("Test server timeout");

  let clientConnection = DDP.connect(Meteor.absoluteUrl(), {
    heartbeatInterval: 0,
    respondToPings: false,
  });

  await expectConnectAndReconnect(clientConnection);

  clientConnection.close();
  console.log("test successful\n");
};

(async function () {
  Meteor._printReceivedDDP = true;
  Meteor._printSentDDP = true;
  await testClientTimeout().catch((e) =>
    console.error("Error in testClientTimeout", e)
  );
  await testServerTimeout().catch((e) =>
    console.error("Error in testServerTimeout", e)
  );
  process.exit(0);
})();
