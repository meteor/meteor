if (Meteor.isServer) {
  Meteor.startup(function () {
    throw new Error("Should be line 3!");
  });
}
