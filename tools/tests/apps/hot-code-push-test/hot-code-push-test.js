if (Meteor.isClient) {
  var sessionVar = Session.get("sessionVar");

  Meteor.defer(function () {
    Meteor.call("clientLoad",
                typeof jsVar === 'undefined' ? 'undefined' : jsVar,
                typeof packageVar === 'undefined' ? 'undefined' : packageVar,
                sessionVar);
  });

  Session.setDefault("sessionVar", true);
}

if (Meteor.isServer) {
  var clientConnections = 0;

  Meteor.methods({
    clientLoad: function (jsVar, packageVar, sessionVar) {
      // Make sure that the process still has the correct working directory.
      process.cwd();
      console.log("client connected: " + clientConnections++);
      console.log("jsVar: " + jsVar);
      console.log("packageVar: " + packageVar);
      console.log("sessionVar: " + sessionVar);
    }
  });
}
