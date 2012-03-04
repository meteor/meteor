// XXX this isn't going to work -- when connecting to a remote server,
// the user isn't going to know to include /sockjs. need to add it in
// stream_client..

// Path matches sockjs 'prefix' in stream_server. We should revisit this
// once we specify the 'on the wire' aspects of livedata more clearly.
App = Meteor.connect('/sockjs', true /* restart_on_update */);

_.extend(Meteor, {
  status: function () {
    return App.status();
  },

  reconnect: function () {
    return App.reconnect();
  },

  subscribe: function (/* arguments */) {
    return App.subscribe.apply(App, _.toArray(arguments));
  },

  refresh: function (notification) {
  }
});
