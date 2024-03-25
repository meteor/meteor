Facebook = {};
import crypto from 'crypto';
import { Accounts } from 'meteor/accounts-base';

const API_VERSION = Meteor.settings?.public?.packages?.['facebook-oauth']?.apiVersion || '17.0';

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
    };
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
const getTokenResponse = async (query) => {
  const config = ServiceConfiguration.configurations.findOne({
    service: 'facebook',
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  const absoluteUrlOptions = getAbsoluteUrlOptions(query);
  const redirectUri = OAuth._redirectUri('facebook', config, undefined, absoluteUrlOptions);

  return OAuth._fetch(
    `https://graph.facebook.com/v${API_VERSION}/oauth/access_token`,
    'GET',
    {
      queryParams: {
        client_id: config.appId,
        redirect_uri: redirectUri,
        client_secret: OAuth.openSecret(config.secret),
        code: query.code,
      },
    }
  )
    .then((res) => res.json())
    .then(data => {
      const fbAccessToken = data.access_token;
      const fbExpires = data.expires_in;
      if (!fbAccessToken) {
        throw new Error("Failed to complete OAuth handshake with facebook " +
          `-- can't find access token in HTTP response. ${data}`);
      }
      return {
        accessToken: fbAccessToken,
        expiresIn: fbExpires
      };
    })
    .catch((err) => {
      throw Object.assign(
        new Error(
          `Failed to complete OAuth handshake with Facebook. ${err.message}`
        ),
        { response: err.response }
      );
    });
};

const getIdentity = async (accessToken, fields) => {
  const config = ServiceConfiguration.configurations.findOne({
    service: 'facebook',
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  // Generate app secret proof that is a sha256 hash of the app access token, with the app secret as the key
  // https://developers.facebook.com/docs/graph-api/securing-requests#appsecret_proof
  const hmac = crypto.createHmac('sha256', OAuth.openSecret(config.secret));
  hmac.update(accessToken);

  return OAuth._fetch(`https://graph.facebook.com/v${API_VERSION}/me`, 'GET', {
    queryParams: {
      access_token: accessToken,
      appsecret_proof: hmac.digest('hex'),
      fields: fields.join(','),
    },
  })
    .then((res) => res.json())
    .catch((err) => {
      throw Object.assign(
        new Error(`Failed to fetch identity from Facebook. ${err.message}`),
        { response: err.response }
      );
    });
};

Facebook.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);

