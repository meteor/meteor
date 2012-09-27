if (!Meteor.accounts.github) {
	Meteor.accounts.github = {};
}

Meteor.accounts.github.config = function(options) {
	Meteor.accounts.github._options = options;
};