var Template = Package.templating && Package.templating.Template;

var holdCount = 1;
LaunchScreen = {
  hold: function () {
    holdCount++;
    if (holdCount === 1 && navigator.splashscreen)
      navigator.splashscreen.show();
  },
  release: function () {
    holdCount--;
    if (! holdCount && navigator.splashscreen)
      navigator.splashscreen.hide();
  }
};

// on startup it should be clear what templates are there
Meteor.startup(function () {
  if (! Template) return;
  LaunchScreen.hold();

  if (Package['iron:router']) {
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

Meteor.startup(function () {
  LaunchScreen.release();
});

