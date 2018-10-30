Template.configureLoginServiceDialogForMeetup.helpers({
  siteUrl: () => Meteor.absoluteUrl(),
});

Template.configureLoginServiceDialogForMeetup.fields = () => [
  {property: 'clientId', label: 'Key'},
  {property: 'secret', label: 'Secret'}
]
