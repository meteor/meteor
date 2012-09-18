Template.configureLoginServicesDialogForFacebook.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServicesDialogForFacebook.fields = function () {
  return [
    {property: 'appId', label: 'App ID'},
    {property: 'secret', label: 'App Secret'}
  ];
};