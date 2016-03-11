let reportIntervalId;
let onConnectListener;

Census = {
  name: 'census',
  version: '0.0.1',
  report: Reporter,

  // Starts sampling app stats
  startSampling() {
    Stats.maxSessions = Stats.currSessions;
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
const onConnectHandler = () => {
  // Update max sessions as well if needed
  if (Stats.currSessions > Stats.maxSessions) Stats.maxSessions++;
};