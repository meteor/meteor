const Events = Npm.require('events');
const Os = Npm.require('os');

const name = 'census';
const version = '0.0.1';

// env variables
let appId;
let rootUrl;
let reportRate;
let autoSample;

// helper vriables
let currentSessionsNum;
let maxSessionsNum;
let onConnectListener;
let reportIntervalId;

Meteor.startup(function() {
  appId = process.env.APP_ID;
  rootUrl = process.env.ROOT_URL;
  reportRate = process.env.CENSUS_REPORT_RATE || 24 * 60 * 60 * 1000;
  autoSample = Utils.bool(process.env.CENSUS_AUTO_SAMPLE || true);

  if (autoSample) startSampling();
});

function startSampling() {
  reportIntervalId = Meteor.setInterval(report, reportRate);
  onConnectListener = Meteor.onConnection(onConnectHandler);
  maxSessionsNum = currentSessionsNum = 0;
}

function stopSampling() {
  clearInterval(reportIntervalId);
  onConnectListener.stop();
}

function report() {
  const stats = composeStats();

  Stats.send(stats, (err, response, body) => {
    err = err || (response.statusCode != 200 && body);

    if (err) {
      process.stderr.write('Failed to send stats\n');
      Census.emit('report:fail', err);
    }
    else {
      process.stdout.write('Stats have been sent\n');
      Census.emit('report:success', body);
    }
  });
}

function onConnectHandler(connection) {
  connection.onClose(onDisconnectHandler);
  if (++currentSessionsNum > maxSessionsNum) ++maxSessionsNum;
}

function onDisconnectHandler() {
  --currentSessionsNum;
}

function composeStats() {
  return {
    properties: {
      appId: appId,
      rootUrl: rootUrl,
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

Census = _.extend(new Events.EventEmitter(), {
  name,
  version,
  startSampling,
  stopSampling
});
