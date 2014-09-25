Template.configureLoginServiceDialogForMeteorDeveloper.helpers({
  siteUrl: function () {
    return Meteor.absoluteUrl();
  },

  fields: function () {
    return [
      {property: 'clientId', label: 'App ID'},
      {property: 'secret', label: 'App secret'}
    ];
  }
});
