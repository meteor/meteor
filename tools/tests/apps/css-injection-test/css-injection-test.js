if (Meteor.isClient) {
  var trim = function (string) {
    return string.replace(/^\s*|\s*$/g, '');
  };

  var allCss = function () {
    return trim(_.map(document.styleSheets, function (stylesheet) {
      return _.pluck(_.values(stylesheet.rules), 'cssText').join('\n');
    }).join('\n'));
  };

  Meteor.call("clientLoad");
  var numCssChanges = 0;
  var oldCss = allCss();
  Meteor.call("newStylesheet", numCssChanges, oldCss);
  setInterval(function () {
    var newCss = allCss();
    if (oldCss !== newCss) {
      oldCss = newCss;
      Meteor.call("newStylesheet", ++numCssChanges, newCss);
    }
  }, 500);
}

if (Meteor.isServer) {
  Meteor.methods({
    clientLoad: function () {
      console.log("client connected");
    },

    newStylesheet: function (numCssChanges, cssText) {
      console.log("numCssChanges: " + numCssChanges);
      console.log("new css: " + cssText);
    }
  });
}