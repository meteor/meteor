if (typeof Meteor === "undefined") Meteor = {};

// XXX this isn't going to work -- when connecting to a remote server,
// the user isn't going to know to include /sockjs. need to add it in
// stream_client..

// Path matches sockjs 'prefix' in stream_server. We should revisit this
// once we specify the 'on the wire' aspects of livedata more clearly.
App = Meteor.connect('/sockjs');

_.extend(Meteor, {
  is_server: false,
  is_client: true,

  status: function () {
    return App.status();
  },

  reconnect: function () {
    return App.reconnect();
  },

  subscribe: function (/* arguments */) {
    return App.subscribe.apply(App, _.toArray(arguments));
  }
});
