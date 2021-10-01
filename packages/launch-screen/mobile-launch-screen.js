// XXX This currently implements loading screens for mobile apps only,
// but in the future can be expanded to all apps.

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
        released = true;
        holdCount--;
        if (holdCount === 0 &&
            typeof navigator !== 'undefined' && navigator.splashscreen) {
          alreadyHidden = true;
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
