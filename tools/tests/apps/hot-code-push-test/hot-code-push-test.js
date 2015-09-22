if (Meteor.isClient) {
  var sessionVar = Session.get("sessionVar");

  var maybeCall = function () {
    var A = Package.autoupdate.Autoupdate;
    if (A._ClientVersions.findOne() && ! A.newClientAvailable()) {
      Meteor.call("clientLoad",
                  typeof jsVar === 'undefined' ? 'undefined' : jsVar,
                  typeof packageVar === 'undefined' ? 'undefined' : packageVar,
                  sessionVar);
    } else {
      setTimeout(maybeCall, 100);
    }
  };
  // Wait a little to "ensure" that "client modified" messages (etc) appear
  // before our messages
  setTimeout(maybeCall, 300);

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
