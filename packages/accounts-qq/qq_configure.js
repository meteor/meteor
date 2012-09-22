Template.configureLoginServicesDialogForQQ.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServicesDialogForQQ.fields = function () {
  return [
    {property: 'clientId', label: 'App ID'},
    {property: 'secret', label: 'App Key'}
  ];
};