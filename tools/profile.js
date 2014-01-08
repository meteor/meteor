// Bootstrap into making the Meteor tinyprofile package available in
// the tools environment.
//
// We can't load the tinyprofile package until we have a library, so
// any profiling functions called are a no-op until we're initialized.

var noop = function (bucket, fn) {
  return fn;
};

noop.run = function (bucket, f) {
  return f();
};

noop.time = function (bucket, f) {
  return f();
};

var Profile = noop;

module.exports = function (bucketName, fn) {
  return function (/*arguments*/) {
    return Profile(bucketName, fn).apply(this, arguments);
  };
};

module.exports.run = function (/*arguments*/) {
  return Profile.run.apply(null, arguments);
};

module.exports.time = function (/*arguments*/) {
  return Profile.time.apply(null, arguments);
};

var initialized = false;

module.exports.initialize = function (library) {
  if (initialized)
    return;

  // Note we carefully don't require unipackage until initialization
  // time.  (Otherwise we'd have circular require calls when we wanted
  // to profile watch.js).
  Profile = require('./unipackage.js').load({
    library: library,
    packages: ['tinyprofile']
  }).tinyprofile.Profile;

  initialized = true;
};
