Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  environments: ["client", "server"],
  internal: true
});

// It would be sort of nice if minimongo didn't depend on underscore,
// so we could ship it separately.
Package.depend('underscore', 'json');

Package.source([
  'minimongo.js',
  'selector.js',
  'sort.js',
  'uuid.js',
  'modify.js'
]);
