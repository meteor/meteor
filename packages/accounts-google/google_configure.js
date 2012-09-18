Template.configureLoginServicesDialogForGoogle.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServicesDialogForGoogle.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client secret'}
  ];
};