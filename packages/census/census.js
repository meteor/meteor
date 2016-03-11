let reportIntervalId;
let onConnectListener;

Census = {
  name: 'census',
  version: '0.0.1',
  report: Reporter,

  // Starts sampling app stats
  startSampling() {
    Stats.maxSessions = Stats.currSessions = 0;
    reportIntervalId = Meteor.setInterval(Reporter, Config.reportRate);
    onConnectListener = Meteor.onConnection(onConnectHandler);
  },

  // Stop sampling app stats
  stopSampling() {
    clearInterval(reportIntervalId);
    onConnectListener.stop();
  }
};

// Once a connection has been made
onConnectHandler = (connection) => {
  connection.onClose(onDisconnectHandler);
  // Update max sessions as well if needed
  if (++Stats.currSessions > Stats.maxSessions) ++Stats.maxSessions;
};

// Once a connection has been closed
onDisconnectHandler = () => {
  --Stats.currSessions;
};