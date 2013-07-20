// XXX These should probably not actually be public?

// @export Accounts.urls.resetPassword
Accounts.urls.resetPassword = function (token) {
  return Meteor.absoluteUrl('#/reset-password/' + token);
};

// @export Accounts.urls.verifyEmail
Accounts.urls.verifyEmail = function (token) {
  return Meteor.absoluteUrl('#/verify-email/' + token);
};

// @export Accounts.urls.enrollAccount
Accounts.urls.enrollAccount = function (token) {
  return Meteor.absoluteUrl('#/enroll-account/' + token);
};
