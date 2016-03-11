const Events = Npm.require('events');
const Os = Npm.require('os');

const name = 'census';
const version = '0.0.1';

let currentSessionsNum;
let maxSessionsNum;
let onConnectListener;
let reportIntervalId;

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
function report() {
  const stats = composeStats();

  Stats.send(stats, (err, result) => {
    if (err)
      Census.emit('report:fail', err);
    else
      Census.emit('report:success', result);
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

Census = new Events.EventEmitter()

// Report events loggers
  .on('report:success', function() {
    process.stdout.write('Stats have been sent\n');
  })

  .on('report:fail', function() {
    process.stderr.write('Failed to send stats\n');
  });

_.extend(Census, {
  name,
  version,
  startSampling,
  stopSampling
});