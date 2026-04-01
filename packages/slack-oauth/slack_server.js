Slack = {};

// Slack uses OpenID Connect (Sign in with Slack).
// https://api.slack.com/authentication/sign-in-with-slack
OAuth.registerService('slack', 2, null, async query => {
  const accessToken = await getAccessToken(query);
  const identity = await getIdentity(accessToken);

  return {
    serviceData: {
      id: identity.sub,
      accessToken: OAuth.sealSecret(accessToken),
      email: identity.email || '',
      emailVerified: identity['email_verified'],
      name: identity.name,
      givenName: identity['given_name'],
      familyName: identity['family_name'],
      picture: identity.picture,
      teamId: identity['https://slack.com/team_id'],
    },
    options: {
      profile: {name: identity.name},
    },
  };
});

let userAgent = 'Meteor';
if (Meteor.release) userAgent += `/${Meteor.release}`;

const getAccessToken = async query => {
  const config = await ServiceConfiguration.configurations.findOneAsync({
    service: 'slack'
  });
  if (!config) throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    const content = new URLSearchParams({
      client_id: config.clientId,
      client_secret: OAuth.openSecret(config.secret),
      code: query.code,
      grant_type: 'authorization_code',
      redirect_uri: OAuth._redirectUri('slack', config),
    });
    const request = await OAuth._fetch(
      'https://slack.com/api/openid.connect.token',
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
      new Error(`Failed to complete OAuth handshake with Slack. ${err.message}`),
      {response: err.response}
    );
  }
  if (!response.ok) {
    throw new Error(
      `Failed to complete OAuth handshake with Slack. ${response.error}`
    );
  }
  return response.access_token;
};

const getIdentity = async accessToken => {
  try {
    const request = await OAuth._fetch(
      'https://slack.com/api/openid.connect.userInfo',
      'GET',
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': userAgent,
        },
      }
    );
    const data = await request.json();
    if (!data.ok) {
      throw new Error(data.error || 'Unknown error');
    }
    return data;
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Slack. ${err.message}`),
      {response: err.response}
    );
  }
};

Slack.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
