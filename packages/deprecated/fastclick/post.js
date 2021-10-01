// This exports object was created in pre.js.  Now copy the 'FastClick' object
// from it into the package-scope variable `FastClick`, which will get exported.

FastClick = module.exports.FastClick;

Meteor.startup(function () {
  FastClick.attach(document.body);
});
