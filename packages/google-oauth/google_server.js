import Google from './namespace.js';
import { Accounts } from 'meteor/accounts-base';
import { fetch } from 'meteor/fetch';

const hasOwn = Object.prototype.hasOwnProperty;

// https://developers.google.com/accounts/docs/OAuth2Login#userinfocall
Google.whitelistedFields = [
  'id',
  'email',
  'verified_email',
  'name',
  'given_name',
  'family_name',
  'picture',
  'locale',
  'timezone',
  'gender',
];

const getServiceDataFromTokens = async (tokens, callback) => {
  const { accessToken, idToken } = tokens;
  const scopes = await getScopes(accessToken).catch((err) => {
    const error = Object.assign(
      new Error(`Failed to fetch tokeninfo from Google. ${err.message}`),
      { response: err.response }
    );
    callback && callback(error);
    throw error;
  });

  let identity = await getIdentity(accessToken).catch((err) => {
    const error = Object.assign(
      new Error(`Failed to fetch identity from Google. ${err.message}`),
      { response: err.response }
    );
    callback && callback(error);
    throw error;
  });
  const serviceData = {
    accessToken,
    idToken,
    scope: scopes,
  };

  if (hasOwn.call(tokens, 'expiresIn')) {
    serviceData.expiresAt = Date.now() + 1000 * parseInt(tokens.expiresIn, 10);
  }

  const fields = Object.create(null);
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
  const returnValue = {
    serviceData,
    options: {
      profile: {
        name: identity.name,
      },
    },
  };

  callback && callback(undefined, returnValue);

  return returnValue;
};

const GOOGLE_ID_TOKEN_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// The web clientId plus any native (iOS/Android) client ids the app lists in
// its service configuration as `additionalClientIds`.
const acceptedClientIds = (config) => {
  const ids = [config.clientId];
  if (Array.isArray(config.additionalClientIds)) {
    ids.push(...config.additionalClientIds);
  }
  return ids.filter(id => id != null && id !== '').map(String);
};

const fetchTokenInfo = async (url, params) => {
  const content = new URLSearchParams(params);
  try {
    const request = await OAuth._fetch(`${url}?${content.toString()}`, 'GET', {
      headers: { Accept: 'application/json' },
    });
    return await request.json();
  } catch (e) {
    return null;
  }
};

// Confirm that a client-supplied access token was actually issued for THIS
// application. Without this check the direct-accessToken login path is a
// confused-deputy: an attacker could replay a victim's token that was minted
// for a different (attacker-controlled) Google client and be logged in as the
// victim. Fail closed on any mismatch, missing audience, or network/parse error.
//
// Access tokens from the native Google Sign-In SDKs are issued to the iOS or
// Android client, not to the web clientId. Those are accepted when the app
// lists that client in `additionalClientIds`, or when they come with an ID
// token whose audience is this application; in that case the Google user id
// the access token must resolve to is returned so the caller can match it.
const verifyTokenClient = async (tokens) => {
  const config = await ServiceConfiguration.configurations.findOneAsync({
    service: 'google',
  });
  if (!config) throw new ServiceConfiguration.ConfigError();
  const clientIds = acceptedClientIds(config);

  const accessTokenInfo = await fetchTokenInfo(
    'https://www.googleapis.com/oauth2/v1/tokeninfo',
    { access_token: tokens.accessToken }
  );
  if (!accessTokenInfo) {
    throw new Meteor.Error(403, 'Failed to verify Google access token');
  }

  const audience = accessTokenInfo.audience ?? accessTokenInfo.issued_to;
  if (audience && clientIds.includes(String(audience))) {
    return null;
  }

  if (typeof tokens.idToken === 'string' && tokens.idToken) {
    const idTokenInfo = await fetchTokenInfo(
      'https://oauth2.googleapis.com/tokeninfo',
      { id_token: tokens.idToken }
    );
    if (
      idTokenInfo?.aud &&
      idTokenInfo.sub &&
      clientIds.includes(String(idTokenInfo.aud)) &&
      GOOGLE_ID_TOKEN_ISSUERS.includes(idTokenInfo.iss)
    ) {
      return String(idTokenInfo.sub);
    }
  }

  throw new Meteor.Error(
    403,
    'Google access token was not issued for this application'
  );
};

Accounts.registerLoginHandler(async (request) => {
  if (request.googleSignIn !== true) {
    return;
  }
  const tokens = {
    accessToken: request.accessToken,
    refreshToken: request.refreshToken,
    idToken: request.idToken,
  };

  if (request.serverAuthCode) {
    Object.assign(
      tokens,
      await getTokens({
        code: request.serverAuthCode,
      })
    );
  }

  // Verify the token's audience against this app's clientId before trusting the
  // identity derived from it. Runs before the try/catch below so the 403 is
  // surfaced verbatim instead of being wrapped as a generic handshake failure.
  const idTokenUserId = await verifyTokenClient(tokens);

  let result;
  try {
    result = await getServiceDataFromTokens(tokens);
  } catch (err) {
    throw Object.assign(
      new Error(
        `Failed to complete OAuth handshake with Google. ${err.message}`
      ),
      { response: err.response }
    );
  }

  // A native access token was accepted on the strength of its ID token, so
  // both must belong to the same Google user.
  if (
    idTokenUserId !== null &&
    String(result.serviceData.id) !== idTokenUserId
  ) {
    throw new Meteor.Error(
      403,
      'Google access token was not issued for this application'
    );
  }

  return Accounts.updateOrCreateUserFromExternalService(
    'google',
    result.serviceData,
    result.options
  );
});

// returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
// - refreshToken, if this is the first authorization request
const getTokens = async (query, callback) => {
  const config = await ServiceConfiguration.configurations.findOneAsync({
    service: 'google',
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  const content = new URLSearchParams({
    code: query.code,
    client_id: config.clientId,
    client_secret: OAuth.openSecret(config.secret),
    redirect_uri: OAuth._redirectUri('google', config),
    grant_type: 'authorization_code',
  });
  const request = await OAuth._fetch('https://accounts.google.com/o/oauth2/token', 'POST', {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: content,
  });
  const response = await request.json();

  if (response.error) {
    // if the http response was a json object with an error attribute
    callback && callback(response.error);
    throw new Meteor.Error(
      `Failed to complete OAuth handshake with Google. ${response.error}`
    );
  } else {
    const data = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
      idToken: response.id_token,
    };
    callback && callback(undefined, data);
    return data;
  }
};

const getServiceData = async (query) =>
  getServiceDataFromTokens(await getTokens(query));

OAuth.registerService('google', 2, null, getServiceData);

const getIdentity = async (accessToken, callback) => {
  const content = new URLSearchParams({ access_token: accessToken });
  let response;
  try {
    const request = await OAuth._fetch(
      `https://www.googleapis.com/oauth2/v1/userinfo?${content.toString()}`,
      'GET',
      {
        headers: { Accept: 'application/json' },
      }
    );
    response = await request.json();
  } catch (e) {
    callback && callback(e);
    throw new Meteor.Error(e.reason);
  }
  callback && callback(undefined, response);
  return response;
};

const getScopes = async (accessToken, callback) => {
  const content = new URLSearchParams({ access_token: accessToken });
  let response;
  try {
    const request = await OAuth._fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?${content.toString()}`,
      'GET',
      {
        headers: { Accept: 'application/json' },
      }
    );
    response = await request.json();
  } catch (e) {
    callback && callback(e);
    throw new Meteor.Error(e.reason);
  }
  callback && callback(undefined, response.scope.split(' '));
  return response.scope.split(' ');
};

Google.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
