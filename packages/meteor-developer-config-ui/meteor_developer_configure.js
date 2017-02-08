Template.configureLoginServiceDialogForMeteorDeveloper.helpers({
  siteUrl: function () {
    return Meteor.absoluteUrl();
  }
});

Template.configureLoginServiceDialogForMeteorDeveloper.fields = function () {
  return [
    {property: 'clientId', label: 'App ID'},
    {property: 'secret', label: 'App secret'}
  ];
};
