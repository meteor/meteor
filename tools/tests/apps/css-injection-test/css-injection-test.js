if (Meteor.isClient) {
  var backgroundColor = function () {
    if (document.body.currentStyle) // IE
      return document.body.currentStyle['background-color'];
    else
      return window.getComputedStyle(document.body, null).backgroundColor;
  };

  Meteor.startup(function () {
    Meteor.call("clientLoad");
    var numCssChanges = 0;
    var oldCss = backgroundColor();
    Meteor.call("newStylesheet", numCssChanges, oldCss);
    var callingServer = false;
    Meteor.setInterval(function () {
      if (callingServer)
        return;

      var newCss = backgroundColor();
      if (oldCss !== newCss) {
        callingServer = true;
        // give the client some time to load the new css
        Meteor.setTimeout(function () {
          var newCss = backgroundColor();
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