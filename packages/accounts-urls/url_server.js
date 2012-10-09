if (typeof Accounts === 'undefined')
  Accounts = {};

if (!Accounts.urls)
  Accounts.urls = {};

Accounts.urls.resetPassword = function (token) {
  return Meteor.absoluteUrl('#/reset-password/' + token);
};

Accounts.urls.confirmEmail = function (token) {
  return Meteor.absoluteUrl('#/confirm-email/' + token);
};

Accounts.urls.enrollAccount = function (token) {
  return Meteor.absoluteUrl('#/enroll-account/' + token);
};
