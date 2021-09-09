Template.configureLoginServiceDialogForFacebook.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForFacebook.fields = () => [
  {property: 'appId', label: 'App ID'},
  {property: 'secret', label: 'App Secret'}
];
