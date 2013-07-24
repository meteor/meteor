// XXX These should probably not actually be public?

Accounts.urls = {};

Accounts.urls.resetPassword = function (token) {
  return Meteor.absoluteUrl('#/reset-password/' + token);
};

Accounts.urls.verifyEmail = function (token) {
  return Meteor.absoluteUrl('#/verify-email/' + token);
};

Accounts.urls.enrollAccount = function (token) {
  return Meteor.absoluteUrl('#/enroll-account/' + token);
};
