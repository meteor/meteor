Gizmos = new Meteor.Collection("gizmos");

if (Meteor.isClient) {

  var allGizmos = Meteor.subscribe("allGizmos");

  Template.main.numGizmos = function () {
    return Gizmos.find().count();
  };

  Template.main.events({
    'click #login': function (evt) {
      Meteor.loginWithGoogle(function (err) {
        if (err)
          Meteor._debug(err);
      });
      evt.preventDefault();
    },
    'click #logout': function (evt) {
      Meteor.logout(function (err) {
        if (err)
          Meteor._debug(err);
      });
      evt.preventDefault();
    }
  });
}

if (Meteor.isServer) {

  Meteor.startup(function () {
    // populate the Gizmos collection if it's empty on startup
    if (Gizmos.find().count() === 0) {
      for (var i = 0; i < 1000; i++)
        Gizmos.insert({ name: "Gizmo " + i });
    }
  });

  Meteor.publish("allGizmos", function () {
    // Only publish the Gizmos if user is logged in.
    var user = this.userId && Meteor.users.findOne(this.userId);
    if (user) {
      // potentially put other conditions on user here...
      return Gizmos.find({});
    }
    return [];
  });

  Meteor.publish(null, function () {
    // If logged in, autopublish the current user's Google email
    // to the client (which isn't published by default).
    return this.userId &&
      Meteor.users.find(this.userId,
                        {fields: {'services.google.email': 1}});
  });

}
