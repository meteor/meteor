Template.configureLoginServiceDialogForTwitter.helpers({
  siteUrl: function () {
  // Twitter doesn't recognize localhost as a domain name
    return Meteor.absoluteUrl({replaceLocalhost: true});
  }
});

Template.configureLoginServiceDialogForTwitter.fields = function () {
  return [
    {property: 'consumerKey', label: 'API key'},
    {property: 'secret', label: 'API secret'}
  ];
};
