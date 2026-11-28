Template.configureLoginServiceDialogForMeteorDeveloper.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForMeteorDeveloper.fields = () => [
  {property: 'clientId', label: 'Client ID'},
  {property: 'secret', label: 'Secret'}
];
