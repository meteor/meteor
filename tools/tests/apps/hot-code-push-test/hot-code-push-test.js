if (Meteor.isClient) {
  Meteor.startup(function () {
    Meteor.call("clientLoad", typeof jsVar === 'undefined' ? 'undefined' : jsVar);
  });
}

if (Meteor.isServer) {
  var clientConnections = 0;

  Meteor.methods({
    clientLoad: function (jsVar) {
      // Make sure that the process still has the correct working directory.
      process.cwd();
      console.log("client connected: " + clientConnections++);
      console.log("jsVar: " + jsVar);
    }
  });
}