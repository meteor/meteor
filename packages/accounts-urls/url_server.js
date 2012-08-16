if (!Meteor.accounts)
  Meteor.accounts = {};

if (!Meteor.accounts.urls)
  Meteor.accounts.urls = {};

Meteor.accounts.urls.resetPassword = function (token) {
  return Meteor.absoluteUrl('#?reset-password/' + token);
};

Meteor.accounts.urls.validateEmail = function (token) {
  return Meteor.absoluteUrl('#?validate-email/' + token);
};

Meteor.accounts.urls.enrollAccount = function (token) {
  return Meteor.absoluteUrl('#?enroll-account/' + token);
};
