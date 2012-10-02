if (!Meteor.accounts.instagram) {
    Meteor.accounts.instagram = {};
    Meteor.accounts.instagram._requireConfigs = ['_clientId', '_appUrl', '_scope'];
}

Meteor.accounts.instagram.config = function(clientId, appUrl, scope) {
    Meteor.accounts.instagram._clientId = clientId;
    Meteor.accounts.instagram._appUrl = appUrl;
    Meteor.accounts.instagram._scope = scope;
};
