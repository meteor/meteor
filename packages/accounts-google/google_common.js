if (!Meteor.accounts.google) {
  Meteor.accounts.google = {};
}

Meteor.accounts.google.config = function(options) {
  Meteor.accounts.google._options = options;
};
