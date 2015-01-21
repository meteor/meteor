if (Meteor.isServer) {
  Meteor.startup(function () {
    console.log("My pid is " + process.pid);
  });
}
