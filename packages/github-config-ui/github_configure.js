Template.configureLoginServiceDialogForGithub.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForGithub.fields = () => [
  {property: 'clientId', label: 'Client ID'},
  {property: 'secret', label: 'Client Secret'}
];
