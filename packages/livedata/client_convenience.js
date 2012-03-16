_.extend(Meteor, {
  // XXX this isn't going to work -- when connecting to a remote
  // server, the user isn't going to know to include /sockjs. need to
  // add it in stream_client..

  // Path matches sockjs 'prefix' in stream_server. We should revisit
  // this once we specify the 'on the wire' aspects of livedata more
  // clearly.
  default_connection: Meteor.connect('/sockjs', true /* restart_on_update */),

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
