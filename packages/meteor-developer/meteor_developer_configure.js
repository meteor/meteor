Template.configureLoginServiceDialogForMeteorDeveloper.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServiceDialogForMeteorDeveloper.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client secret'}
  ];
};
