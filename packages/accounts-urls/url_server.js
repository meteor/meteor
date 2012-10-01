if (typeof Accounts === 'undefined')
  Accounts = {};

if (!Accounts.urls)
  Accounts.urls = {};

Accounts.urls.resetPassword = function (token) {
  return Meteor.absoluteUrl('#?reset-password/' + token);
};

Accounts.urls.validateEmail = function (token) {
  return Meteor.absoluteUrl('#?validate-email/' + token);
};

Accounts.urls.enrollAccount = function (token) {
  return Meteor.absoluteUrl('#?enroll-account/' + token);
};
