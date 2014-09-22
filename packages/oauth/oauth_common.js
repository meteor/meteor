OAuth._storageTokenPrefix = "Meteor.oauth.credentialSecret-";

OAuth._redirectUri = function (serviceName, config, params, absoluteUrlOptions) {
  // XXX COMPAT WITH 0.9.0
  // The redirect URI used to have a "?close" query argument.  We
  // detect whether we need to be backwards compatible by checking for
  // the absence of the `loginStyle` field, which wasn't used in the
  // code which had the "?close" argument.
  var query = config.loginStyle ? null : "close";

  return URL._constructUrl(
    Meteor.absoluteUrl('_oauth/' + serviceName, absoluteUrlOptions),
    query,
    params);
};
