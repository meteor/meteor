Template.configureLoginServicesDialogForQQ.siteUrl = function () {
  return 'http://yourdomain.com/';
};

Template.configureLoginServicesDialogForQQ.fields = function () {
  return [
    {property: 'clientId', label: 'App Key'},
    {property: 'secret', label: 'App Secret'}
  ];
};