import { Meteor } from 'meteor/meteor';
import { DDP } from '../common/namespace.js';
import { loadAsyncStubHelpers } from './queue_stub_helpers';

export const _calculateDDPUrl = ({
  absoluteUrl,
  runtimeConfig = Object.create(null),
  browserHost,
  browserProtocol,
}) => {
  if (runtimeConfig.DDP_DEFAULT_CONNECTION_URL) {
    return runtimeConfig.DDP_DEFAULT_CONNECTION_URL;
  }

  const protocol = (absoluteUrl && absoluteUrl.split('//')[0]) || browserProtocol;
  return `${protocol}//${browserHost}/`;
};

const getDDPUrl = () => {
  const runtimeConfig = typeof __meteor_runtime_config__ !== 'undefined'
    ? __meteor_runtime_config__
    : Object.create(null);

  return _calculateDDPUrl({
    absoluteUrl: Meteor.absoluteUrl(),
    runtimeConfig,
    browserHost: window.location.host,
    browserProtocol: window.location.protocol,
  });
};

// Meteor.refresh can be called on the client (if you're in common code) but it
// only has an effect on the server.
Meteor.refresh = () => {};

// By default, connect to the current browser host so mirrored domains
// establish their websocket connection against the same host users loaded.
// Keep the protocol from Meteor.absoluteUrl() to preserve force-ssl behavior.
const ddpUrl = getDDPUrl() || '/';

const retry = new Retry();

function onDDPVersionNegotiationFailure(description) {
  Meteor._debug(description);
  if (Package.reload) {
    const migrationData = Package.reload.Reload._migrationData('livedata') || Object.create(null);
    let failures = migrationData.DDPVersionNegotiationFailures || 0;
    ++failures;
    Package.reload.Reload._onMigrate('livedata', () => [true, { DDPVersionNegotiationFailures: failures }]);
    retry.retryLater(failures, () => {
      Package.reload.Reload._reload({ immediateMigration: true });
    });
  }
}

// Makes sure to inject the stub async helpers before creating the connection
loadAsyncStubHelpers();

Meteor.connection = DDP.connect(ddpUrl, {
  onDDPVersionNegotiationFailure: onDDPVersionNegotiationFailure
});

// Proxy the public methods of Meteor.connection so they can
// be called directly on Meteor.
[
  'subscribe',
  'methods',
  'isAsyncCall',
  'call',
  'callAsync',
  'apply',
  'applyAsync',
  'status',
  'reconnect',
  'disconnect'
].forEach(name => {
  Meteor[name] = Meteor.connection[name].bind(Meteor.connection);
});
