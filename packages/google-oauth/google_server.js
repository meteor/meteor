var Google = require("./namespace.js");
var Accounts = require("meteor/accounts-base").Accounts;
var hasOwn = Object.prototype.hasOwnProperty;

// https://developers.google.com/accounts/docs/OAuth2Login#userinfocall
Google.whitelistedFields = ['id', 'email', 'verified_email', 'name', 'given_name',
                   'family_name', 'picture', 'locale', 'timezone', 'gender'];

function getServiceDataFromTokens(tokens) {
  var accessToken = tokens.accessToken;
  var idToken = tokens.idToken;
  var scopes = getScopes(accessToken);
  var identity = getIdentity(accessToken);
  var serviceData = {
    accessToken: accessToken,
    idToken: idToken,
    scope: scopes
  };

  if (hasOwn.call(tokens, "expiresIn")) {
    serviceData.expiresAt =
      Date.now() + 1000 * parseInt(tokens.expiresIn, 10);
  }

  var fields = Object.create(null);
  Google.whitelistedFields.forEach(function (name) {
    if (hasOwn.call(identity, name)) {
      fields[name] = identity[name];
    }
  });

  Object.assign(serviceData, fields);

  // only set the token in serviceData if it's there. this ensures
  // that we don't lose old ones (since we only get this on the first
  // log in attempt)
  if (tokens.refreshToken) {
    serviceData.refreshToken = tokens.refreshToken;
  }

  return {
    serviceData: serviceData,
    options: {
      profile: {
        name: identity.name
      }
    }
  };
}

Accounts.registerLoginHandler(function (request) {
  if (request.googleSignIn !== true) {
    return;
  }

  const tokens = {
    accessToken: request.accessToken,
    refreshToken: request.refreshToken,
    idToken: request.idToken,
  };

  if (request.serverAuthCode) {
    Object.assign(tokens, getTokens({
      code: request.serverAuthCode
    }));
  }

  const result = getServiceDataFromTokens(tokens);

  return Accounts.updateOrCreateUserFromExternalService("google", {
    id: request.userId,
    idToken: request.idToken,
    accessToken: request.accessToken,
    email: request.email,
    picture: request.imageUrl,
    ...result.serviceData,
  }, result.options);
});

function getServiceData(query) {
  return getServiceDataFromTokens(getTokens(query));
}

OAuth.registerService('google', 2, null, getServiceData);

// returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
// - refreshToken, if this is the first authorization request
var getTokens = function (query) {
  var config = ServiceConfiguration.configurations.findOne({service: 'google'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  var response;
  try {
    response = HTTP.post(
      "https://accounts.google.com/o/oauth2/token", {params: {
        code: query.code,
        client_id: config.clientId,
        client_secret: OAuth.openSecret(config.secret),
        redirect_uri: OAuth._redirectUri('google', config),
        grant_type: 'authorization_code'
      }});
  } catch (err) {
    throw Object.assign(
      new Error("Failed to complete OAuth handshake with Google. " + err.message),
      { response: err.response }
    );
  }

  if (response.data.error) { // if the http response was a json object with an error attribute
    throw new Error("Failed to complete OAuth handshake with Google. " + response.data.error);
  } else {
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      idToken: response.data.id_token
    };
  }
};

var getIdentity = function (accessToken) {
  try {
    return HTTP.get(
      "https://www.googleapis.com/oauth2/v1/userinfo",
      {params: {access_token: accessToken}}).data;
  } catch (err) {
    throw Object.assign(
      new Error("Failed to fetch identity from Google. " + err.message),
      { response: err.response }
    );
  }
};

var getScopes = function (accessToken) {
  try {
    return HTTP.get(
      "https://www.googleapis.com/oauth2/v1/tokeninfo",
      {params: {access_token: accessToken}}).data.scope.split(' ');
  } catch (err) {
    throw Object.assign(
      new Error("Failed to fetch tokeninfo from Google. " + err.message),
      { response: err.response }
    );
  }
};

Google.retrieveCredential = function(credentialToken, credentialSecret) {
  return OAuth.retrieveCredential(credentialToken, credentialSecret);
};
