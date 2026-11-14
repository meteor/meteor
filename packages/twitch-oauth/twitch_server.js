Twitch = {};

OAuth.registerService('twitch', 2, null, async query => {
  const accessToken = await getAccessToken(query);
  const identity = await getIdentity(accessToken);

  return {
    serviceData: {
      id: identity.id,
      accessToken: OAuth.sealSecret(accessToken),
      login: identity.login,
      displayName: identity.display_name,
      email: identity.email || '',
      avatar: identity.profile_image_url,
      description: identity.description,
      broadcasterType: identity.broadcaster_type,
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
    service: 'twitch'
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    const content = new URLSearchParams({
      client_id: config.clientId,
      client_secret: OAuth.openSecret(config.secret),
      code: query.code,
      grant_type: 'authorization_code',
      redirect_uri: OAuth._redirectUri('twitch', config),
    });
    const request = await OAuth._fetch(
      'https://id.twitch.tv/oauth2/token',
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
      new Error(`Failed to complete OAuth handshake with Twitch. ${err.message}`),
      {response: err.response}
    );
  }
  if (response.error) {
    throw new Error(
      `Failed to complete OAuth handshake with Twitch. ${response.error}`
    );
  }
  return response.access_token;
};

const getIdentity = async accessToken => {
  const config = await ServiceConfiguration.configurations.findOneAsync({
    service: 'twitch'
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  try {
    const request = await OAuth._fetch(
      'https://api.twitch.tv/helix/users',
      'GET',
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': config.clientId,
          'User-Agent': userAgent,
        },
      }
    );
    const data = await request.json();
    const identity = data && data.data && data.data[0];
    if (!identity || !identity.id) {
      throw new Error(
        'Twitch identity response does not contain the expected user data.'
      );
    }
    return identity;
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Twitch. ${err.message}`),
      {response: err.response}
    );
  }
};

Twitch.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
