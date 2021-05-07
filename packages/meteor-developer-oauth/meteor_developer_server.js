OAuth.registerService("meteor-developer", 2, null, query => {
  const response = getTokens(query);
  const { accessToken } = response;
  const identity = getIdentity(accessToken);

  const serviceData = {
    accessToken: OAuth.sealSecret(accessToken),
    expiresAt: (+new Date) + (1000 * response.expiresIn)
  };

  Object.assign(serviceData, identity);

  // only set the token in serviceData if it's there. this ensures
  // that we don't lose old ones (since we only get this on the first
  // log in attempt)
  if (response.refreshToken)
    serviceData.refreshToken = OAuth.sealSecret(response.refreshToken);

  return {
    serviceData,
    options: {profile: {name: serviceData.username}}
    // XXX use username for name until meteor accounts has a profile with a name
  };
});

// returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
// - refreshToken, if this is the first authorization request and we got a
//   refresh token from the server
const getTokens = async (query) => {
  const config = ServiceConfiguration.configurations.findOne({
    service: 'meteor-developer'
  });
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    const request = await fetch(MeteorDeveloperAccounts._server + "/oauth2/token", {
      method: 'POST',
      headers: { Accept: 'application/json' },
      params: {
        grant_type: "authorization_code",
        code: query.code,
        client_id: config.clientId,
        client_secret: OAuth.openSecret(config.secret),
        redirect_uri: OAuth._redirectUri('meteor-developer', config)
      }
    });
    response = await request.json();
  } catch (err) {
    throw Object.assign(
      new Error(
        "Failed to complete OAuth handshake with Meteor developer accounts. "
          + err.message
      ),
      {response: err.response}
    );
  }

  if (response.error) {
    // if the http response was a json object with an error attribute
    throw new Error(
      "Failed to complete OAuth handshake with Meteor developer accounts. " +
        (response.data ? response.data.error :
         "No response data")
    );
  } else {
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in
    };
  }
};

const getIdentity = async (accessToken) => {
  try {
    const request = await fetch(
    `${MeteorDeveloperAccounts._server}/api/v1/identity`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`}
    });
    const response = await request.json();
    return response.data;
  } catch (err) {
    throw Object.assign(
      new Error("Failed to fetch identity from Meteor developer accounts. " +
                err.message),
      {response: err.response}
    );
  }
};

MeteorDeveloperAccounts.retrieveCredential =
  (credentialToken, credentialSecret) =>
    OAuth.retrieveCredential(credentialToken, credentialSecret);
