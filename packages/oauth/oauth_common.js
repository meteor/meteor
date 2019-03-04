OAuth._storageTokenPrefix = "Meteor.oauth.credentialSecret-";

OAuth._redirectUri = (serviceName, config, params, absoluteUrlOptions) => {
  // XXX COMPAT WITH 0.9.0
  // The redirect URI used to have a "?close" query argument.  We
  // detect whether we need to be backwards compatible by checking for
  // the absence of the `loginStyle` field, which wasn't used in the
  // code which had the "?close" argument.
  // This logic is duplicated in the tool so that the tool can do OAuth
  // flow with <= 0.9.0 servers (tools/auth.js).
  const query = config.loginStyle ? null : "close";

  // Clone because we're going to mutate 'params'. The 'cordova' and
  // 'android' parameters are only used for picking the host of the
  // redirect URL, and not actually included in the redirect URL itself.
  let isCordova = false;
  let isAndroid = false;
  if (params) {
    params = { ...params };
    isCordova = params.cordova;
    isAndroid = params.android;
    delete params.cordova;
    delete params.android;
    if (Object.keys(params).length === 0) {
      params = undefined;
    }
  }

  if (Meteor.isServer && isCordova) {
    const url = Npm.require('url');
    let rootUrl = process.env.MOBILE_ROOT_URL ||
          __meteor_runtime_config__.ROOT_URL;

    if (isAndroid) {
      // Match the replace that we do in cordova boilerplate
      // (boilerplate-generator package).
      // XXX Maybe we should put this in a separate package or something
      // that is used here and by boilerplate-generator? Or maybe
      // `Meteor.absoluteUrl` should know how to do this?
      const parsedRootUrl = url.parse(rootUrl);
      if (parsedRootUrl.hostname === "localhost") {
        parsedRootUrl.hostname = "10.0.2.2";
        delete parsedRootUrl.host;
      }
      rootUrl = url.format(parsedRootUrl);
    }

    absoluteUrlOptions = {
      ...absoluteUrlOptions,
      // For Cordova clients, redirect to the special Cordova root url
      // (likely a local IP in development mode).
      rootUrl,
    };
  }

  return URL._constructUrl(
    Meteor.absoluteUrl(`_oauth/${serviceName}`, absoluteUrlOptions),
    query,
    params);
};
