Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  internal: true
});

// It would be sort of nice if minimongo didn't depend on underscore,
// so we could ship it separately.
Package.require('underscore');
Package.require('json');

Package.client_file('minimongo.js');
Package.client_file('selector.js');
Package.client_file('sort.js');
Package.client_file('uuid.js');
Package.client_file('modify.js');
