Template.configureLoginServiceDialogForMeteorId.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServiceDialogForMeteorId.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client secret'}
  ];
};
