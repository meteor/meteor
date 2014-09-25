Template.configureLoginServiceDialogForGoogle.helpers({
  siteUrl: function () {
    return Meteor.absoluteUrl();
  },

  fields: function () {
    return [
      {property: 'clientId', label: 'Client ID'},
      {property: 'secret', label: 'Client secret'}
    ];
  }
});
