if (!Meteor.accounts)
  Meteor.accounts = {};

if (!Meteor.accounts.urls)
  Meteor.accounts.urls = {};

Meteor.accounts.urls.resetPassword = function (baseUrl, token) {
  return baseUrl + '#?reset-password/' + token;
};

Meteor.accounts.urls.validateEmail = function (baseUrl, token) {
  return baseUrl + '#?validate-email/' + token;
};
