Template.configureLoginServiceDialogForGoogle.helpers({
  siteUrl: function () {
    var url = Meteor.absoluteUrl();
    if (url.slice(-1) === "/") {
      url = url.slice(0,-1)
    }
    return url;
  }
});

Template.configureLoginServiceDialogForGoogle.fields = function () {
  return [
    {property: 'clientId', label: 'Client ID'},
    {property: 'secret', label: 'Client secret'}
  ];
};
