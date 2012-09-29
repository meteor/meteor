Template.configureLoginServicesDialogForInstagram.siteUrl = function () {
    // instagram doesn't recognize localhost as a domain
    return Meteor.absoluteUrl({replaceLocalhost: true});
};

Template.configureLoginServicesDialogForInstagram.fields = function () {
    return [
        {property: 'clientId', label: 'Client Id'},
        {property: 'secret', label: 'Client Secret'}
    ];
};