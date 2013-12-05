Package.describe({
  summary: "Include a standard set of Meteor packages in your app"
});

Package.on_use(function(api) {
  // The "imply" here means that if your app uses "standard-app-packages", it is
  // treated as if it also directly included all of these packages (and it gets
  // their exports, plugins, etc).
  //
  // If you want, you can "meteor remove standard-app-packages" and add some of
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
    // Deps.autorun and friends. What's Meteor without reactivity?
    'deps',
    // The easiest way to get a little reactivity into your app.
    'session',
    // DDP: Meteor's client/server protocol.
    'livedata',
    // You want to keep your data somewhere? How about MongoDB?
    'mongo-livedata',
    // You want some views? How about Handlebars-based templating?
    'templating',
    // What, you want to call Handlebars.registerHandler? Sounds good to me.
    'handlebars',
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
});
