if (!Meteor.accounts.qq) {
  Meteor.accounts.qq = {};
}

Meteor.accounts.qq.config = function(options) {
  Meteor.accounts.qq._options = options;
};
