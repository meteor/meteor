Template.configureLoginServiceDialogForMeetup.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServiceDialogForMeetup.fields = function () {
  return [
    {property: 'clientId', label: 'Key'},
    {property: 'secret', label: 'Secret'}
  ];
};