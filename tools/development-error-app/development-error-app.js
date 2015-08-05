if (Meteor.isServer) {
  // Set connection to null to use Minimongo on server
  Errors = new Mongo.Collection("errors", {connection: null});
  Refreshing = new Mongo.Collection("refreshing", {connection: null});

  Meteor.publish("errors", function () {
    return Errors.find();
  });

  Meteor.publish("refreshing", function () {
    return Refreshing.find();
  });

  Meteor.methods({
    addErrorMessage: function (errMsg) {
      Errors.insert({
        text: errMsg,
        createdAt: new Date()
      });
    },

    disconnectEveryone: function () {
      var self = this;
      _.each(Meteor.server.sessions, function (session) {
        if (self.connection.id !== session.id)
          session.connectionHandle.close();
      });
    },

    isAppRefreshing: function (bool) {
      Refreshing.upsert({_id: 'is-app-refreshing'}, {value: bool});
    }
  });
}

if (Meteor.isClient) {
  // Need to define connection twice because setting connection to null on
  // client means it should ignore the DDP connection to the server
  Errors = new Mongo.Collection("errors");
  Refreshing = new Mongo.Collection("refreshing");
  Meteor.subscribe("errors");
  Meteor.subscribe("refreshing");
  Template.body.helpers({
    errors: function () {
      return Errors.find({}, {sort: {createdAt: -1} });
    },
    refreshing: function () {
      return Refreshing.find({_id: 'is-app-refreshing'}).fetch()[0].value;
    }
  });
}

