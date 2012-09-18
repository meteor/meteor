Template.configureLoginServicesDialogForTwitter.siteUrl = function () {
  // Twitter doesn't recognize localhost as a domain name
  return Meteor.absoluteUrl({replaceLocalhost: true});
};

Template.configureLoginServicesDialogForTwitter.fields = function () {
  return [
    {property: 'consumerKey', label: 'Consumer key'},
    {property: 'secret', label: 'Consumer secret'}
  ];
};