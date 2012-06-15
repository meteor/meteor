if (!Meteor.accounts.google) {
  Meteor.accounts.google = {};
}

Meteor.accounts.google.config = function(clientId, appUrl) {
  Meteor.accounts.google._clientId = clientId;
  Meteor.accounts.google._appUrl = appUrl;
};
