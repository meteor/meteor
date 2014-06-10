if (Meteor.isClient) {
  var trim = function (string) {
    return string.replace(/^\s*|\s*$/g, '');
  };

  var allCss = function () {
    return trim(_.map(document.styleSheets, function (stylesheet) {
      return _.pluck(_.values(stylesheet.rules), 'cssText').join('\n');
    }).join('\n'));
  };

  Meteor.startup(function () {
    Meteor.call("clientLoad");
    var numCssChanges = 0;
    var oldCss = allCss();
    Meteor.call("newStylesheet", numCssChanges, oldCss);
    var callingServer = false;
    Meteor.setInterval(function () {
      if (callingServer)
        return;

      var newCss = allCss();
      if (oldCss !== newCss) {
        callingServer = true;
        // give the client some time to load the new css
        Meteor.setTimeout(function () {
          var newCss = allCss();
          oldCss = newCss;
          Meteor.call("newStylesheet", ++numCssChanges, newCss);
          callingServer = false;
        }, 1000);
      }
    }, 500);
  });
}

if (Meteor.isServer) {
  Meteor.methods({
    clientLoad: function () {
      console.log("client connected");
    },

    newStylesheet: function (numCssChanges, cssText) {
      console.log("numCssChanges: " + numCssChanges);
      console.log("css: " + cssText);
    }
  });
}