Template.configureLoginServiceDialogForGoogle.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServiceDialogForGoogle.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client secret'}
  ];
};
