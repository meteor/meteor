Template.configureLoginServiceDialogForFacebook.helpers({
  siteUrl: function () {
    return Meteor.absoluteUrl();
  }
});

Template.configureLoginServiceDialogForFacebook.fields = function () {
  return [
    {property: 'appId', label: 'App ID'},
    {property: 'secret', label: 'App Secret'}
  ];
};
