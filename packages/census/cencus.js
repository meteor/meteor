const Events = Npm.require('events');
const Os = Npm.require('os');

const name = 'census';
const version = '0.0.1';

let currentSessionsNum;
let maxSessionsNum;
let onConnectListener;
let reportIntervalId;

Census = new Events.EventEmitter();

Meteor.startup(function() {
  if (Config.autoSample) startSampling();
});

// Starts sampling
function startSampling() {
  reportIntervalId = Meteor.setInterval(report, Config.reportRate);
  onConnectListener = Meteor.onConnection(onConnectHandler);
  maxSessionsNum = currentSessionsNum = 0;
}

// Stops sampling
function stopSampling() {
  clearInterval(reportIntervalId);
  onConnectListener.stop();
}

// Sends stats
function report(callback = _.identity) {
  const stats = composeStats();

  Stats.send(stats, (err, result) => {
    // Resetting max sessions counter
    maxSessionsNum = currentSessionsNum;

    if (err) {
      callback(err);
      Census.emit('report:fail', err);
    }
    else {
      callback(null, result);
      Census.emit('report:success', result);
    }
  });
}

// Once a connection has been made
function onConnectHandler(connection) {
  connection.onClose(onDisconnectHandler);
  // Update max sessions as well if needed
  if (++currentSessionsNum > maxSessionsNum) ++maxSessionsNum;
}

// Once a connection has been remoed
function onDisconnectHandler() {
  --currentSessionsNum;
}

// Composes statistics object
function composeStats() {
  return {
    properties: {
      appId: Config.appId,
      appSecret: Config.appSecret,
      rootUrl: Config.rootUrl,
      version: Meteor.release,
      maxSessions: maxSessionsNum
    },
    context: {
      app:{
        name: name,
        version: version
      },
      ip: Utils.ip(),
      os: {
        name: Os.platform(),
        version: Os.release()
      }
    }
  };
}

_.extend(Census, {
  name,
  version,
  startSampling,
  stopSampling,
  report
});