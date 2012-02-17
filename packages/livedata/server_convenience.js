if (typeof Meteor === "undefined") Meteor = {};

App = new Meteor._LivedataServer;

_.extend(Meteor, {
  is_server: true,
  is_client: false,

  publish: _.bind(App.publish, App)
});
