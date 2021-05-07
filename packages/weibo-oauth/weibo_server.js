Weibo = {};

OAuth.registerService('weibo', 2, null, query => {

  const response = getTokenResponse(query);
  const uid = parseInt(response.uid, 10);

  // different parts of weibo's api seem to expect numbers, or strings
  // for uid. let's make sure they're both the same.
  if (response.uid !== uid + "") {
    throw new Error(`Expected 'uid' to parse to an integer: ${JSON.stringify(response)}`);
  }

  const identity = getIdentity(response.access_token, uid);

  return {
    serviceData: {
      // We used to store this as a string, so keep it this way rather than
      // add complexity to Account.updateOrCreateUserFromExternalService or
      // force a database migration
      id: uid + "",
      accessToken: response.access_token,
      screenName: identity.screen_name,
      expiresAt: (+new Date) + (1000 * response.expires_in)
    },
    options: {profile: {name: identity.screen_name}}
  };
});

// return an object containing:
// - uid
// - access_token
// - expires_in: lifetime of this token in seconds (5 years(!) right now)
const getTokenResponse = async (query) => {
  const config = ServiceConfiguration.configurations.findOne({service: 'weibo'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    const request = await fetch("https://api.weibo.com/oauth2/access_token", {
      method: 'POST',
      headers: { Accept: 'application/json' },
      params: {
        code: query.code,
        client_id: config.clientId,
        client_secret: OAuth.openSecret(config.secret),
        redirect_uri: OAuth._redirectUri('weibo', config, null, {replaceLocalhost: true}),
        grant_type: 'authorization_code'
      }
    });
    response = await request.json();
  } catch (err) {
    throw Object.assign(new Error(`Failed to complete OAuth handshake with Weibo. ${err.message}`),
                   {response: err.response});
  }

  if (response.error) { // if the http response was a json object with an error attribute
    throw new Error(`Failed to complete OAuth handshake with Weibo. ${response.error}`);
  } else {
    return response;
  }
};

const getIdentity = async (accessToken, userId) => {
  try {
    const request = await fetch(
      "https://api.weibo.com/2/users/show.json",
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        params: {
          access_token: accessToken,
          uid: userId
        }
      });
    const response = await request.json();
    return response.data;
  } catch (err) {
    throw Object.assign(new Error("Failed to fetch identity from Weibo. " + err.message),
                   {response: err.response});
  }
};

Weibo.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
