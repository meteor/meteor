// Meteor.refresh can be called on the client (if you're in common code) but it
// only has an effect on the server.
Meteor.refresh = function (notification) {
};

if (Meteor.isClient) {
  // By default, try to connect back to the same endpoint as the page
  // was served from.
  //
  // XXX We should be doing this a different way. Right now we don't
  // include ROOT_URL_PATH_PREFIX when computing ddpUrl. (We don't
  // include it on the server when computing
  // DDP_DEFAULT_CONNECTION_URL, and we don't include it in our
  // default, '/'.) We get by with this because DDP.connect then
  // forces the URL passed to it to be interpreted relative to the
  // app's deploy path, even if it is absolute. Instead, we should
  // make DDP_DEFAULT_CONNECTION_URL, if set, include the path prefix;
  // make the default ddpUrl be '' rather that '/'; and make
  // _translateUrl in stream_client_common.js not force absolute paths
  // to be treated like relative paths. See also
  // stream_client_common.js #RationalizingRelativeDDPURLs
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
