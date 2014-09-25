Template.configureLoginServiceDialogForTwitter.helpers({
  siteUrl: function () {
  // Twitter doesn't recognize localhost as a domain name
    return Meteor.absoluteUrl({replaceLocalhost: true});
  },

  fields: function () {
    return [
      {property: 'consumerKey', label: 'API key'},
      {property: 'secret', label: 'API secret'}
    ];
  }
});
