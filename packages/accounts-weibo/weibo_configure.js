Template.configureLoginServicesDialogForWeibo.siteUrl = function () {
  // Weibo doesn't recognize localhost as a domain
  return Meteor.absoluteUrl().replace('localhost', '127.0.0.1');
};

Template.configureLoginServicesDialogForWeibo.fields = function () {
  return [
    {property: 'clientId', label: 'App Key'},
    {property: 'secret', label: 'App Secret'}
  ];
};