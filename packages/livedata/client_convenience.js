(function () {
  // By default, try to connect back to the same endpoint as the page
  // was served from.
  var ddpUrl = '/';

  if (typeof __meteor_runtime_config__ !== "undefined") {
    if (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL)
      ddpUrl = __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
  }

  var ddpAppUrl = ddpUrl;

  if (typeof __meteor_runtime_config__ !== "undefined") {
    if (__meteor_runtime_config__.DDP_APP_CONNECTION_URL)
      ddpAppUrl = __meteor_runtime_config__.DDP_APP_CONNECTION_URL;
  }

  // Connect to this app server for hot code push
  _.extend(Meteor, {
    app_connection: Meteor.connect(ddpAppUrl, true /* restart_on_update */),

    refresh: function (notification) {
    }
  });

  // Connect meteor to this app server or remote server
  _.extend(Meteor, {
    default_connection: (ddpUrl == ddpAppUrl)?
            Meteor.app_connection:Meteor.connect(ddpUrl, false /* dont use remote restart_on_update */)
  });

  // Proxy the public methods of Meteor.default_connection so they can
  // be called directly on Meteor.
  _.each(['subscribe', 'methods', 'call', 'apply', 'status', 'reconnect'],
         function (name) {
           Meteor[name] = _.bind(Meteor.default_connection[name],
                                 Meteor.default_connection);
         });
})();
