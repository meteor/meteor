Template.configureLoginServicesDialogForQQ.isLocalhost = function () {
  return /localhost|127.0.0.1/.test(Meteor.absoluteUrl());
};

Template.configureLoginServicesDialogForQQ.siteUrl = function () {
  return Meteor.absoluteUrl();
};

Template.configureLoginServicesDialogForQQ.fields = function () {
  return [{
    property: 'clientId',
    label: 'App ID'
  }, {
    property: 'secret',
    label: 'App Key'
  }];
}; 