Meteor.isFibersDisabled = true;

Meteor._isPromise = function (r) {
  return r && typeof r.then === "function";
};
