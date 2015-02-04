// Hold launch screen on app load. This reflects the fact that Meteor
// mobile apps that use this package always start with a launch screen
// visible. (see XXX comment at the top of package.js for more
// details)
var handle = LaunchScreen.hold();

var Template = Package.templating && Package.templating.Template;

Meteor.startup(function () {
  if (! Template) {
    handle.release();
  } else if (Package['iron:router']) {
    // XXX Instead of doing this here, this code should be in
    // iron:router directly. Note that since we're in a
    // `Meteor.startup` block it's ok that we don't have a
    // weak dependency on iron:router in package.js.
    Package['iron:router'].Router.onAfterAction(function () {
      handle.release();
    });
  } else {
    Template.body.onRendered(function () {
      handle.release();
    });

    // In case `Template.body` never gets rendered (due to some bug),
    // hide the launch screen after 6 seconds. This matches the
    // observed timeout that Cordova apps on Android (but not iOS)
    // have on hiding the launch screen (even if you don't call
    // `navigator.splashscreen.hide()`)
    setTimeout(function () {
      handle.release();
    }, 6000);
  }
});
