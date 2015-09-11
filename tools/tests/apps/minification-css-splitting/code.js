if (Meteor.isClient) {
  function report () {
    Meteor.call(
      'output',
      'the number of stylesheets: <' +
      document.querySelectorAll('link[rel=stylesheet]').length + '>');

    Meteor.call(
      'output',
      'the color of the tested 4097th property: <' +
      getComputedStyle(document.querySelectorAll('.class-4097')[0]).color +
      '>');
  };
  function linkHref (prev) {
    var links = document.getElementsByTagName('link');
    if (links.length === 2) {
      return JSON.stringify(_.pluck(links, 'href'));
    } else if (links.length > 0 && links.length > 2) {
      // this is the period of time when we have both new and old
      // stylesheets, just count this as "nothing changed"
      return prev;
    } else {
      return null;
    }
  }

  Meteor.startup(function () {
    Meteor.call("clientLoad");
    var numCssChanges = 0;
    var oldLinkHref = linkHref();
    report();
    var waitingForCssReloadToComplete = false;

    // give the client some time to load the new css
    var handle = Meteor.setInterval(function () {
      var newLinkHref = linkHref(oldLinkHref);
      if (newLinkHref !== oldLinkHref) {
        oldLinkHref = newLinkHref;
        report();
      }
    }, 500);
  });
} else {
  Meteor.methods({
    output: function (text) {
      console.log(text);
    },
    clientLoad: function () {
      console.log('client connected');
    }
  });
}
