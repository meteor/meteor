if (!Meteor.accounts.google) {
  Meteor.accounts.google = {};
}

Meteor.accounts.google.setup = function(clientId, appUrl) {
  Meteor.accounts.google._clientId = clientId;
  Meteor.accounts.google._appUrl = appUrl;
};

Meteor.accounts.google.SetupError = function(description) {
  this.message = description;
};
