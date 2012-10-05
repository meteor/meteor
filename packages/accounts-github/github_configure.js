Template.configureLoginServicesDialogForGithub.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServicesDialogForGithub.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client Secret'}
  ];
};