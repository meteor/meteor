(function () {
  // By default, try to connect back to the same endpoint as the page
  // was served from.
  var ddp_endpoint = '/';
  if (typeof __meteor_runtime_config__ !== "undefined" &&
      __meteor_runtime_config__.DEFAULT_DDP_ENDPOINT)
    ddp_endpoint = __meteor_runtime_config__.DEFAULT_DDP_ENDPOINT;

  _.extend(Meteor, {
    default_connection: Meteor.connect(ddp_endpoint,
                                       true /* restart_on_update */),

    refresh: function (notification) {
    }
  });

  // Proxy the public methods of Meteor.default_connection so they can
  // be called directly on Meteor.
  _.each(['subscribe', 'methods', 'call', 'apply', 'status', 'reconnect'],
         function (name) {
           Meteor[name] = _.bind(Meteor.default_connection[name],
                                 Meteor.default_connection);
         });

})();
