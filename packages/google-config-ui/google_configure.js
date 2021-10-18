Template.configureLoginServiceDialogForGoogle.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForGoogle.fields = () => [
  { property: 'clientId', label: 'Client ID' },
  { property: 'secret', label: 'Client secret' },
];
