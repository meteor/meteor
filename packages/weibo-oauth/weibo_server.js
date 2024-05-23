Weibo = {};

OAuth.registerService('weibo', 2, null, async query => {

  const response = await getTokenResponse(query);
  const uid = parseInt(response.uid, 10);

  // different parts of weibo's api seem to expect numbers, or strings
  // for uid. let's make sure they're both the same.
  if (response.uid !== uid + "") {
    throw new Error(`Expected 'uid' to parse to an integer: ${JSON.stringify(response)}`);
  }

  const identity = await getIdentity(response.access_token, uid);

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

// return an object containining:
// - uid
// - access_token
// - expires_in: lifetime of this token in seconds (5 years(!) right now)
const getTokenResponse = async (query) => {
  const config = ServiceConfiguration.configurations.findOne({
    service: 'weibo',
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  return OAuth._fetch('https://api.weibo.com/oauth2/access_token', 'POST', {
    queryParams: {
      code: query.code,
      client_id: config.clientId,
      client_secret: OAuth.openSecret(config.secret),
      redirect_uri: OAuth._redirectUri('weibo', config, null, {
        replaceLocalhost: true,
      }),
      grant_type: 'authorization_code',
    },
  })
    .then((res) => res.json())
    .catch((err) => {
      throw Object.assign(
        new Error(
          `Failed to complete OAuth handshake with Weibo. ${err.message}`
        ),
        { response: err.response }
      );
    });
};

const getIdentity = async (accessToken, userId) => {
  return OAuth._fetch('https://api.weibo.com/2/users/show.json', 'GET', {
    queryParams: {
      access_token: accessToken,
      uid: userId,
    },
  })
    .then((res) => res.json())
    .catch((err) => {
      throw Object.assign(
        new Error('Failed to fetch identity from Weibo. ' + err.message),
        { response: err.response }
      );
    });
};

Weibo.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
