Template.configureLoginServiceDialogForGoogle.helpers({
  siteUrl: () => {
    let url = Meteor.absoluteUrl();
    if (url.slice(-1) === "/") {
      url = url.slice(0,-1)
    }
    return url;
  }
});

Template.configureLoginServiceDialogForGoogle.fields = () => [
  {property: 'clientId', label: 'Client ID'},
  {property: 'secret', label: 'Client secret'}
];
