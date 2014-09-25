// XXX These should probably not actually be public?

Accounts.urls = {};

Accounts.urls.resetPassword = function (token, email) {
  return Meteor.absoluteUrl('#/reset-password/' + token + '/' + email);
};

Accounts.urls.verifyEmail = function (token, email) {
  return Meteor.absoluteUrl('#/verify-email/' + token + '/' + email);
};

Accounts.urls.enrollAccount = function (token, email) {
  return Meteor.absoluteUrl('#/enroll-account/' + token + '/' + email);
};
