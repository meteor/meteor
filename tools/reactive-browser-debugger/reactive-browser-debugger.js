if (Meteor.isServer) {
  // Set connection to null to use Minimongo on server
  Errors = new Mongo.Collection("errors", {connection: null});
  Meteor.publish("errors", function () {
    return Errors.find();
  });
}

if (Meteor.isClient) {
  // Need to define connection twice because setting connection to null on
  // client means it should ignore the DDP connection to the server
  Errors = new Mongo.Collection("errors");
  Meteor.subscribe("errors");
  Template.body.helpers({
    errors: function () {
      return Errors.find({}, {sort: {createdAt: -1} });
    }
  });
}

Meteor.methods({
  addErrorMessage: function (errMsg) {
    if (this.isSimulation)
      return;
    Errors.insert({
      text: errMsg,
      createdAt: new Date()
    });
  },

  disconnectEveryone: function() {
    var self = this;
    _.each(Meteor.server.sessions, function (session) {
      if (self.connection.id !== session.id)
        session.connectionHandle.close();
    });
  }
});