/**
 * @memberof Meteor
 * @summary Boolean variable. True when running in Meteor 3.0. Useful to packages
 * in order to maintain compatibility with Meteor 2.x.
 * @locus Anywhere
 * @static
 * @type {Boolean}
 */
Meteor.isFibersDisabled = true;

Meteor._isPromise = function (r) {
  return r && typeof r.then === "function";
};
