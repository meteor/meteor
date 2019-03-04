Template.configureLoginServiceDialogForWeibo.helpers({
  // Weibo doesn't recognize localhost as a domain
  siteUrl: () => Meteor.absoluteUrl({replaceLocalhost: true}),
});

Template.configureLoginServiceDialogForWeibo.fields = () => [
  {property: 'clientId', label: 'App Key'},
  {property: 'secret', label: 'App Secret'}
];
