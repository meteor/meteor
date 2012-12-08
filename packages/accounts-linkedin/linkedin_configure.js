/*
Template.configureLoginServiceDialogForLinkedin.siteUrl = function () {
  // Linkedi doesn't recognize localhost as a domain name
  return Meteor.absoluteUrl({replaceLocalhost: true});
};
*/
Template.configureLoginServiceDialogForLinkedin.fields = function () {
  return [
    {property: 'apiKey', label: 'API Key'},
    {property: 'secret', label: 'Secret Key'}
  ];
};
