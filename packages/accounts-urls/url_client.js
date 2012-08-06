// reads a reset password token from the url's hash fragment, if it's there. if so
// prevent automatically logging in since it could be confusing to be logged in as user
// A while resetting password for user B
// 
// reset password urls use hash fragments instead of url paths/query
// strings so that the reset password token is not sent over the wire
// on the http request
(function () {
  if (!Meteor.accounts)
    Meteor.accounts = {};

  var match;
  match = window.location.hash.match(/^\#\?reset-password\/(.*)$/);
  if (match) {
    Meteor.accounts._preventAutoLogin = true;
    Meteor.accounts._resetPasswordToken = match[1];
    window.location.hash = '';
  }

  match = window.location.hash.match(/^\#\?validate-user\/(.*)$/);
  if (match) {
    Meteor.accounts._preventAutoLogin = true;
    Meteor.accounts._validateUserToken = match[1];
    window.location.hash = '';
  }
})();
