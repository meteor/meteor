// Meteor.refresh can be called on the client (if you're in common code) but it
// only has an effect on the server.
Meteor.refresh = function (notification) {
};

if (Meteor.isClient) {
  // By default, try to connect back to the same endpoint as the page
  // was served from.
  var ddpUrl = '/';
  if (typeof __meteor_runtime_config__ !== "undefined") {
    if (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL)
      ddpUrl = __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
  }

  var retry = new Retry();

  var onDDPVersionNegotiationFailure = function (description) {
    Meteor._debug(description);
    if (Package.reload) {
      var migrationData = Package.reload.Reload._migrationData('livedata') || {};
      var failures = migrationData.DDPVersionNegotiationFailures || 0;
      ++failures;
      Package.reload.Reload._onMigrate('livedata', function () {
        return [true, {DDPVersionNegotiationFailures: failures}];
      });
      retry.retryLater(failures, function () {
        Package.reload.Reload._reload();
      });
    }
  };

  Meteor.connection =
    DDP.connect(ddpUrl, {
      onDDPVersionNegotiationFailure: onDDPVersionNegotiationFailure
    });

  // Proxy the public methods of Meteor.connection so they can
  // be called directly on Meteor.
  _.each(['subscribe', 'methods', 'call', 'apply', 'status', 'reconnect',
          'disconnect'],
         function (name) {
           Meteor[name] = _.bind(Meteor.connection[name], Meteor.connection);
         });
} else {
  // Never set up a default connection on the server. Don't even map
  // subscribe/call/etc onto Meteor.
  Meteor.connection = null;
}

// Meteor.connection used to be called
// Meteor.default_connection. Provide backcompat as a courtesy even
// though it was never documented.
// XXX COMPAT WITH 0.6.4
Meteor.default_connection = Meteor.connection;

// We should transition from Meteor.connect to DDP.connect.
// XXX COMPAT WITH 0.6.4
Meteor.connect = DDP.connect;
