Template.configureLoginServiceDialogForWeibo.helpers({
  siteUrl: function () {
    // Weibo doesn't recognize localhost as a domain
    return Meteor.absoluteUrl({replaceLocalhost: true});
  },

  fields: function () {
    return [
      {property: 'clientId', label: 'App Key'},
      {property: 'secret', label: 'App Secret'}
    ];
  }
});
