App = new Meteor._LivedataServer;

_.extend(Meteor, {
  publish: _.bind(App.publish, App)
});
