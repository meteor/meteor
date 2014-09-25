Template.configureLoginServiceDialogForFacebook.helpers({
  siteUrl: function () {
    return Meteor.absoluteUrl();
  },
  fields: function () {
    return [
      {property: 'appId', label: 'App ID'},
      {property: 'secret', label: 'App Secret'}
    ];
  }
});
