Spotify = {};

OAuth.registerService('spotify', 2, null, async query => {
  const response = await getAccessToken(query);
  const identity = await getIdentity(response.accessToken);

  return {
    serviceData: {
      id: identity.id,
      accessToken: OAuth.sealSecret(response.accessToken),
      refreshToken: response.refreshToken
        ? OAuth.sealSecret(response.refreshToken)
        : undefined,
      expiresAt: response.expiresAt,
      email: identity.email || '',
      displayName: identity.display_name || '',
      avatar: identity.images && identity.images[0]
        ? identity.images[0].url
        : '',
      country: identity.country,
      product: identity.product,
    },
    options: {
      profile: {name: identity.display_name},
    },
  };
});

let userAgent = 'Meteor';
if (Meteor.release) userAgent += `/${Meteor.release}`;

const getAccessToken = async query => {
  const config = await ServiceConfiguration.configurations.findOneAsync({
    service: 'spotify'
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    const content = new URLSearchParams({
      client_id: config.clientId,
      client_secret: OAuth.openSecret(config.secret),
      code: query.code,
      grant_type: 'authorization_code',
      redirect_uri: OAuth._redirectUri('spotify', config),
    });
    const request = await OAuth._fetch(
      'https://accounts.spotify.com/api/token',
      'POST',
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': userAgent,
        },
        body: content.toString(),
      }
    );
    response = await request.json();
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to complete OAuth handshake with Spotify. ${err.message}`),
      {response: err.response}
    );
  }
  if (response.error) {
    throw new Error(
      `Failed to complete OAuth handshake with Spotify. ${response.error}`
    );
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + 1000 * response.expires_in,
  };
};

const getIdentity = async accessToken => {
  try {
    const request = await OAuth._fetch(
      'https://api.spotify.com/v1/me',
      'GET',
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': userAgent,
        },
      }
    );
    return await request.json();
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Spotify. ${err.message}`),
      {response: err.response}
    );
  }
};

Spotify.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
