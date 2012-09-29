if (!Meteor.accounts.instagram) {
    Meteor.accounts.instagram = {};
    Meteor.accounts.instagram._requireConfigs = ['_clientId', '_appUrl'];
}

Meteor.accounts.instagram.config = function(clientId, appUrl) {
    Meteor.accounts.instagram._clientId = clientId;
    Meteor.accounts.instagram._appUrl = appUrl;
};
