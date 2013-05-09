Template.configureLoginServiceDialogForLinkedin.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServiceDialogForLinkedin.fields = function () {
  return [
    {property: 'clientId', label: 'API Key'},
    {property: 'secret', label: 'Secret Key'}
  ];
};
