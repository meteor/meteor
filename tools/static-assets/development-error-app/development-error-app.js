if (Meteor.isServer) {
  // Set connection to null to use Minimongo on server
  Errors = new Mongo.Collection("errors", {connection: null});
  Refreshing = new Mongo.Collection("refreshing", {connection: null});
  RestartButton = new Mongo.Collection("restart-button", {connection: null});

  Meteor.publish("errors", function () {
    return Errors.find();
  });

  Meteor.publish("refreshing", function () {
    return Refreshing.find();
  });

  Meteor.publish("restart-button", function () {
    let self = this;
    let handle = RestartButton.find({}).observeChanges({
      added: function (id, fields) {
        self.added('restart-button', id, fields);
      },
      changed: function (id, fields) {
        self.changed('restart-button', id, fields);
      },
      removed: function (id, fields) {
        self.removed('restart-button', id, fields);
      }
    });
    self.added('restart-button', 'restart-button-id', {value: false});

    self.ready();

    self.onStop(function () {
      handle.stop();
    });
  });

  Meteor.methods({
    addErrorMessage: function (errMsg, errTime) {
      Errors.insert({
        text: errMsg,
        time: errTime,
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
      RestartButton.upsert({_id: 'restart-button-id'}, {value: false});
    },

    restartButtonClick: function (bool) {
      RestartButton.upsert({_id: 'restart-button-id'}, {value: bool});
    }
  });
}

if (Meteor.isClient) {
  // Need to define connection twice because setting connection to null on
  // client means it should ignore the DDP connection to the server
  Errors = new Mongo.Collection("errors");
  Refreshing = new Mongo.Collection("refreshing");
  RestartButton = new Mongo.Collection("restart-button");
  Meteor.subscribe("errors");
  Meteor.subscribe("refreshing");
  Meteor.subscribe("restart-button");
  Template.body.helpers({
    errors: function () {
      return Errors.find({}, {sort: {createdAt: -1} });
    },
    refreshing: function () {
      return Refreshing.find({_id: 'is-app-refreshing'}).fetch()[0].value;
    }
  });

  Template.restart.events({
    'click .refresh-button': function () {
      Meteor.call('restartButtonClick', true);
    }
  });
}

