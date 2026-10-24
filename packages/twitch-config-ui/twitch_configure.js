Template.configureLoginServiceDialogForTwitch.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForTwitch.fields = () => [
  {property: 'clientId', label: 'Client ID'},
  {property: 'secret', label: 'Client Secret'},
];
