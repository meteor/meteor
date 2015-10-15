Template.configureLoginServiceDialogForGoogle.helpers({
  siteUrl: function () {
    return Meteor.absoluteUrl();
  },
  siteUrlNoTrail: function () {
    if (Meteor.absoluteUrl.slice(-1) === '/') {
      return Meteor.absoluteUrl().slice(0, 1);
    } else {
      return Meteor.absoluteUrl();
    }
  }
});

Template.configureLoginServiceDialogForGoogle.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client secret'}
  ];
};
