Template.configureLoginServiceDialogForFoursquare.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServiceDialogForFoursquare.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client secret'}
  ];
};
