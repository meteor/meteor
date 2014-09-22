if (Meteor.isClient) {
  var backgroundColor = function () {
    return $(document.body).css('background-color');
  };

  var linkHref = function () {
    var links = document.getElementsByTagName('link');
    if (links.length > 0) {
      return links[0].href;
    } else {
      return null;
    }
  }

  Meteor.startup(function () {
    Meteor.call("clientLoad");
    var numCssChanges = 0;
    var oldBackgroundColor = backgroundColor();
    var oldLinkHref = linkHref();
    Meteor.call("newStylesheet", numCssChanges, oldBackgroundColor);
    var waitingForCssReloadToComplete = false;
    Meteor.setInterval(function () {
      if (waitingForCssReloadToComplete)
        return;

      var newBackgroundColor = backgroundColor();
      if (oldBackgroundColor !== newBackgroundColor) {
        waitingForCssReloadToComplete = true;

        // give the client some time to load the new css
        var handle = Meteor.setInterval(function () {
          var newLinkHref = linkHref();
          if (newLinkHref !== oldLinkHref) {
            oldBackgroundColor = backgroundColor();
            oldLinkHref = newLinkHref;
            Meteor.call("newStylesheet", ++numCssChanges, oldBackgroundColor);
            waitingForCssReloadToComplete = false;
            Meteor.clearInterval(handle);
          }
        }, 500);
      }
    }, 500);
  });
}

if (Meteor.isServer) {
  Meteor.methods({
    clientLoad: function () {
      console.log("client connected");
    },

    newStylesheet: function (numCssChanges, backgroundColor) {
      console.log("numCssChanges: " + numCssChanges);
      console.log("background-color: " + backgroundColor);
    }
  });
}
