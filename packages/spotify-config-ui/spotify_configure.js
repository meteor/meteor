Template.configureLoginServiceDialogForSpotify.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForSpotify.fields = () => [
  {property: 'clientId', label: 'Client ID'},
  {property: 'secret', label: 'Client Secret'},
];
