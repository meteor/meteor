// XXX This currently implements loading screens for mobile apps only,
// but in the future can be expanded to all apps.

var Template = Package.templating && Package.templating.Template;

var holdCount = 0;
var alreadyHidden = false;

LaunchScreen = {
  hold: function () {
    if (! Meteor.isCordova)
      return;

    if (alreadyHidden) {
      throw new Error("Can't show launch screen once it's hidden");
    }

    holdCount++;
  },
  release: function () {
    if (! Meteor.isCordova)
      return;

    if (holdCount === 0) {
      throw new Error(
        "Called LaunchScreen.release() more times than " +
          "LaunchScreen.hold(). Make sure to pair " +
          "each call to LaunchScreen.hold() with a single call to " +
          "LaunchScreen.release().");
    }

    holdCount--;
    if (holdCount === 0 &&
        typeof navigator !== 'undefined' && navigator.splashscreen) {
      navigator.splashscreen.hide();
    }
  }
};

// Hold launch screen on app load. This reflects the fact that Meteor
// mobile apps that use this package always start with a launch screen
// visible. (see XXX comment at the top of package.js for more
// details)
LaunchScreen.hold();

Meteor.startup(function () {
  if (! Template) {
    LaunchScreen.release();
  } else if (Package['iron:router']) {
    var released = false;
    Package['iron:router'].Router.onAfterAction(function () {
      if (! released) {
        released = true;
        LaunchScreen.release();
      }
    });
  } else {
    Template.body.rendered = function () {
      LaunchScreen.release();
    };
  }
});
