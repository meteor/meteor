_.extend(Meteor, {
  default_connection: Meteor.connect('/', true /* restart_on_update */),

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
