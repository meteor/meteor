Template.configureLoginServiceDialogForSlack.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForSlack.fields = () => [
  {property: 'clientId', label: 'Client ID'},
  {property: 'secret', label: 'Client Secret'},
];
