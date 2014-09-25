Template.configureLoginServiceDialogForMeetup.helpers({
  siteUrl: function () {
    return Meteor.absoluteUrl();
  },

  fields: function () {
    return [
      {property: 'clientId', label: 'Key'},
      {property: 'secret', label: 'Secret'}
    ];
  }
});
