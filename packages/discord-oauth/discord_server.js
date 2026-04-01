Discord = {};

OAuth.registerService('discord', 2, null, async query => {
  const accessToken = await getAccessToken(query);
  const identity = await getIdentity(accessToken);

  return {
    serviceData: {
      id: identity.id,
      accessToken: OAuth.sealSecret(accessToken),
      username: identity.username,
      globalName: identity.global_name,
      email: identity.email || '',
      verified: identity.verified,
      avatar: identity.avatar
        ? `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png`
        : null,
      discriminator: identity.discriminator,
    },
    options: {
      profile: {name: identity.global_name || identity.username},
    },
  };
});

let userAgent = 'Meteor';
if (Meteor.release) userAgent += `/${Meteor.release}`;

const getAccessToken = async query => {
  const config = await ServiceConfiguration.configurations.findOneAsync({
    service: 'discord'
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    const content = new URLSearchParams({
      client_id: config.clientId,
      client_secret: OAuth.openSecret(config.secret),
      code: query.code,
      grant_type: 'authorization_code',
      redirect_uri: OAuth._redirectUri('discord', config),
    });
    const request = await OAuth._fetch(
      'https://discord.com/api/oauth2/token',
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
      new Error(`Failed to complete OAuth handshake with Discord. ${err.message}`),
      {response: err.response}
    );
  }
  if (response.error) {
    throw new Error(
      `Failed to complete OAuth handshake with Discord. ${response.error}`
    );
  }
  return response.access_token;
};

const getIdentity = async accessToken => {
  try {
    const request = await OAuth._fetch(
      'https://discord.com/api/v10/users/@me',
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
      new Error(`Failed to fetch identity from Discord. ${err.message}`),
      {response: err.response}
    );
  }
};

Discord.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
