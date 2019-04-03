Facebook = {};
import crypto from 'crypto';

Facebook.handleAuthFromAccessToken = (accessToken, expiresAt) => {
  // include basic fields from facebook
  // https://developers.facebook.com/docs/facebook-login/permissions/
  const whitelisted = ['id', 'email', 'name', 'first_name', 'last_name',
    'middle_name', 'name_format', 'picture', 'short_name'];

  const identity = getIdentity(accessToken, whitelisted);

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
  const response = getTokenResponse(query);
  const { accessToken } = response;
  const { expiresIn } = response;

  return Facebook.handleAuthFromAccessToken(accessToken, (+new Date) + (1000 * expiresIn));
});

// checks whether a string parses as JSON
const isJSON = str => {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
};

// returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
const getTokenResponse = query => {
  const config = ServiceConfiguration.configurations.findOne({service: 'facebook'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  let responseContent;
  try {
    // Request an access token
    responseContent = HTTP.get(
      "https://graph.facebook.com/v3.0/oauth/access_token", {
        params: {
          client_id: config.appId,
          redirect_uri: OAuth._redirectUri('facebook', config),
          client_secret: OAuth.openSecret(config.secret),
          code: query.code
        }
      }).data;
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

const getIdentity = (accessToken, fields) => {
  const config = ServiceConfiguration.configurations.findOne({service: 'facebook'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  // Generate app secret proof that is a sha256 hash of the app access token, with the app secret as the key
  // https://developers.facebook.com/docs/graph-api/securing-requests#appsecret_proof
  const hmac = crypto.createHmac('sha256', OAuth.openSecret(config.secret));
  hmac.update(accessToken);

  try {
    return HTTP.get("https://graph.facebook.com/v3.0/me", {
      params: {
        access_token: accessToken,
        appsecret_proof: hmac.digest('hex'),
        fields: fields.join(",")
      }
    }).data;
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Facebook. ${err.message}`),
      { response: err.response },
    );
  }
};

Facebook.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);

