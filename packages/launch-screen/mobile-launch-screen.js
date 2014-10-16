// XXX This currently implements loading screens for mobile apps only,
// but in the future can be expanded to all apps.

var Template = Package.templating && Package.templating.Template;

var holdCount = 0;
var alreadyHidden = false;

LaunchScreen = {
  hold: function () {
    if (! Meteor.isCordova) {
      return {
        release: function () { /* noop */ }
      };
    }

    if (alreadyHidden) {
      throw new Error("Can't show launch screen once it's hidden");
    }

    holdCount++;

    var released = false;
    var release = function () {
      if (! Meteor.isCordova)
        return;

      if (! released) {
        holdCount--;
        if (holdCount === 0 &&
            typeof navigator !== 'undefined' && navigator.splashscreen) {
          navigator.splashscreen.hide();
        }
      }
    };

    // Returns a launch screen handle with a release method
    return {
      release: release
    };
  }
};

// Hold launch screen on app load. This reflects the fact that Meteor
// mobile apps that use this package always start with a launch screen
// visible. (see XXX comment at the top of package.js for more
// details)
var handle = LaunchScreen.hold();

Meteor.startup(function () {
  if (! Template) {
    handle.release();
  } else if (Package['iron:router']) {
    var released = false;
    Package['iron:router'].Router.onAfterAction(function () {
      if (! released) {
        released = true;
        handle.release();
      }
    });
  } else {
    Template.body.rendered = function () {
      handle.release();
    };
  }
});
