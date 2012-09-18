if (!Meteor.accounts.facebook) {
  Meteor.accounts.facebook = {};
}

Meteor.accounts.facebook.config = function(options) {
  Meteor.accounts.facebook._options = options;
};
