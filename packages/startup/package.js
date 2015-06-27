Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.3"
});

Package.onUse(function (api) {
  // Deprecated -- Meteor.startup has been folded into the main
  // 'meteor' package for now, because it seems reasonable to expect
  // that Meteor.startup would always be available without having to
  // include a special package.
});
