Package.describe({
  summary: "(Deprecated) Include a standard set of Meteor packages in your app",
  version: '1.2.3'
});

Package.onUse(function(api) {
  // The "imply" here means that if your app uses "meteor-platform", it is
  // treated as if it also directly included all of these packages (and it gets
  // their exports, plugins, etc).
  //
  // If you want, you can "meteor remove meteor-platform" and add some of
  // these back in individually. We haven't tested every subset, though :)
  api.imply([
    // The normal "every package uses 'meteor'" rule only applies to packages
    // built from a package source directory, so we make sure apps get it too.
    // Meteor.isServer! The CSS extension handler! And so much more!
    'meteor',
    // A standard Meteor app is a web app. (Without this, there will be no
    // 'main' function unless you define one yourself.)
    'webapp',
    // It's Log! It's better than bad, it's good!
    'logging',
    // Tracker.autorun and friends. What's Meteor without reactivity?
    'tracker',
    'deps', // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0.
    // The easiest way to get a little reactivity into your app.
    'session',
    // DDP: Meteor's client/server protocol.
    'ddp',
    'livedata', // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0.
    // You want to keep your data somewhere? How about MongoDB?
    'mongo',
    // Blaze: Reactive DOM!
    'blaze',
    'ui', // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0.
    // A great template language!
    'spacebars',
    // Turn templates into views!
    'templating',
    // Easy type assertions? check.
    'check',
    // _.isUseful(true)
    'underscore',
    // $(".usefulToo")
    'jquery',
    // Life isn't always predictable.
    'random',
    // People like being able to clone objects.
    'ejson'
  ]);

  // These are useful too!  But you don't have to see their exports
  // unless you want to.
  api.use([
    // We can reload the client without messing up methods in flight.
    'reload',
    // And update automatically when new client code is available!
    'autoupdate'
  ], ['client', 'server']);

  // More mobile specific implies
  api.imply([
    // Remove the 300ms click delay on mobile
    'fastclick',
    // Good defaults for the mobile status bar
    'mobile-status-bar'
  ], 'web.cordova');

  api.imply([
    // Launch screen configuration. Currently only on mobile but we include the
    // no-op browser version anyway.
    'launch-screen'
  ], 'web');
});
