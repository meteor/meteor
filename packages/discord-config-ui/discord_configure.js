Template.configureLoginServiceDialogForDiscord.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForDiscord.fields = () => [
  {property: 'clientId', label: 'Client ID'},
  {property: 'secret', label: 'Client Secret'},
];
