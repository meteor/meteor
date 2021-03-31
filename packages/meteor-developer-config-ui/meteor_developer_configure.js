Template.configureLoginServiceDialogForMeteorDeveloper.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForMeteorDeveloper.fields = () => [
  {property: 'clientId', label: 'App ID'},
  {property: 'secret', label: 'App secret'}
];
