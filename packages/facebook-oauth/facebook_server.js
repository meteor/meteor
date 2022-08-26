Facebook = {};
import crypto from 'crypto';
import {Accounts} from 'meteor/accounts-base';

const API_VERSION = Meteor.settings?.public?.packages?.['facebook-oauth']?.apiVersion || '13.0';

Facebook.handleAuthFromAccessToken = async (accessToken, expiresAt) => {
  // include basic fields from facebook
  // https://developers.facebook.com/docs/facebook-login/permissions/
  const whitelisted = ['id', 'email', 'name', 'first_name', 'last_name',
    'middle_name', 'name_format', 'picture', 'short_name'];

  const identity = await getIdentity(accessToken, whitelisted);

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

Accounts.registerLoginHandler(request => {
  if (request.facebookSignIn !== true) {
    return;
  }
  const facebookData = Facebook.handleAuthFromAccessToken(request.accessToken, (+new Date) + (1000 * request.expirationTime));
  return Accounts.updateOrCreateUserFromExternalService('facebook', facebookData.serviceData, facebookData.options);
});

OAuth.registerService('facebook', 2, null, async query => {
  const response = await getTokenResponse(query);
  const {accessToken} = response;
  const {expiresIn} = response;

  return await Facebook.handleAuthFromAccessToken(accessToken, (+new Date) + (1000 * expiresIn));
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

/**
 * @typedef {Object} UserAccessToken
 * @property {string} accessToken - User access Token
 * @property {number} expiresIn - lifetime of token in seconds
 */
/**
 * @async
 * @function getTokenResponse
 * @param {Object} query - An object with the code.
 * @returns {Promise<UserAccessToken>} - Promise with an Object containing the accessToken and expiresIn (lifetime of token in seconds)
 */
const getTokenResponse = async query => {
  const config = ServiceConfiguration.configurations.findOne({service: 'facebook'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  try {
    const absoluteUrlOptions = getAbsoluteUrlOptions(query);
    const redirectUri = OAuth._redirectUri('facebook', config, undefined, absoluteUrlOptions);

    const params = new URLSearchParams();

    params.append("client_id", config.appId)
    params.append("redirect_uri", redirectUri)
    params.append("client_secret", OAuth.openSecret(config.secret))
    params.append("code", query.code)

    const uri = `https://graph.facebook.com/v${API_VERSION}/oauth/access_token?${params.toString()}`

    const response = await fetch(uri, {
      method: "GET",
      headers: {
        Accept: 'application/json',
      },
    })

    const data = await response.json();

    const fbAccessToken = data.access_token;
    const fbExpires = data.expires_in;

    return {
      accessToken: fbAccessToken,
      expiresIn: fbExpires
    };
  } catch (e) {
    throw Object.assign(
      new Error(`Failed to complete OAuth handshake with Facebook. ${err.message}`),
      {response: err.response},
    );
  }
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

    const params = new URLSearchParams();

    params.append("access_token", accessToken)
    params.append("appsecret_proof", hmac.digest('hex'))
    params.append("fields", fields.join(","))

    const uri = `https://graph.facebook.com/v${API_VERSION}/me?${params.toString()}`

    const response = await fetch(uri, {
      method: "GET",
      headers: {
        Accept: 'application/json',
      },
    })

    return response.json();
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Facebook. ${err.message}`),
      {response: err.response},
    );
  }
};

Facebook.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);

