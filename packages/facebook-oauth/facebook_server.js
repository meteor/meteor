Facebook = {};
import { Meteor } from 'meteor/meteor';
import crypto from 'crypto';
import { fetch } from 'meteor/fetch';

const API_VERSION = Meteor.settings?.public?.packages?.['facebook-oauth']?.apiVersion || '10.0';

Facebook.handleAuthFromAccessToken = (accessToken, expiresAt) => {
  // include basic fields from facebook
  // https://developers.facebook.com/docs/facebook-login/permissions/
  const whitelisted = ['id', 'email', 'name', 'first_name', 'last_name',
    'middle_name', 'name_format', 'picture', 'short_name'];

  const identityCall = Meteor.wrapAsync(getIdentity);
  const identity = identityCall(accessToken, whitelisted);

  const fields = {};
  whitelisted.forEach(field => fields[field] = identity[field]);
  const serviceData = {
    accessToken,
    expiresAt,
    ...fields,
  };

  return {
    serviceData,
    options: {profile: {name: identity.name}}
  };
};

OAuth.registerService('facebook', 2, null, query => {
  const responseCall = Meteor.wrapAsync(getTokenResponse);
  const response = responseCall(query);
  const { accessToken } = response;
  const { expiresIn } = response;

  return Facebook.handleAuthFromAccessToken(accessToken, (+new Date) + (1000 * expiresIn));
});

function getAbsoluteUrlOptions(query) {
  const overrideRootUrlFromStateRedirectUrl = Meteor.settings?.packages?.['facebook-oauth']?.overrideRootUrlFromStateRedirectUrl;
  if (!overrideRootUrlFromStateRedirectUrl) {
    return undefined;
  }
  try {
    const state = OAuth._stateFromQuery(query) || {};
    const redirectUrl = new URL(state.redirectUrl);
    return {
      rootUrl: redirectUrl.origin,
    }
  } catch (e) {
    console.error(
      `Failed to complete OAuth handshake with Facebook because it was not able to obtain the redirect url from the state and you are using overrideRootUrlFromStateRedirectUrl.`, e
    );
    return undefined;
  }
}

// returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
const getTokenResponse = async (query) => {
  const config = ServiceConfiguration.configurations.findOne({service: 'facebook'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  let responseContent;
  try {
    const absoluteUrlOptions = getAbsoluteUrlOptions(query);
    const redirectUri = OAuth._redirectUri('facebook', config, undefined, absoluteUrlOptions);
    // Request an access token
    const content = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: redirectUri,
      client_secret: OAuth.openSecret(config.secret),
      code: query.code
    });
    const request = await fetch(
      `https://graph.facebook.com/v${API_VERSION}/oauth/access_token?${content.toString()}`, {
        method: 'GET'
      });
    responseContent = await request.json();
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to complete OAuth handshake with Facebook. ${err.message}`),
      { response: err.response },
    );
  }

  const fbAccessToken = responseContent.access_token;
  const fbExpires = responseContent.expires_in;

  if (!fbAccessToken) {
    throw new Error("Failed to complete OAuth handshake with facebook " +
                    `-- can't find access token in HTTP response. ${responseContent}`);
  }
  return {
    accessToken: fbAccessToken,
    expiresIn: fbExpires
  };
};

const getIdentity = async (accessToken, fields) => {
  const config = ServiceConfiguration.configurations.findOne({service: 'facebook'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  // Generate app secret proof that is a sha256 hash of the app access token, with the app secret as the key
  // https://developers.facebook.com/docs/graph-api/securing-requests#appsecret_proof
  const hmac = crypto.createHmac('sha256', OAuth.openSecret(config.secret));
  hmac.update(accessToken);

  try {
    const content = new URLSearchParams({
      access_token: accessToken,
      appsecret_proof: hmac.digest('hex'),
      fields: fields.join(",")
    })
    const request = await fetch(`https://graph.facebook.com/v${API_VERSION}/me?${content.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    const response = await request.json();
    return response;
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Facebook. ${err.message}`),
      { response: err.response },
    );
  }
};

Facebook.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);

