Meetup = {};

OAuth.registerService('meetup', 2, null, async query => {
  const response = await getAccessToken(query);
  const accessToken = response.access_token;
  const expiresAt = (+new Date) + (1000 * response.expires_in);
  const identity = await getIdentity(accessToken);
  const {
    id,
    name,
    lang,
    link,
    photo,
    country,
    city,
  } = identity;

  return {
    serviceData: {
      id,
      name,
      lang,
      link,
      photo,
      country,
      city,
      accessToken,
      expiresAt,
    },
    options: {
      profile: { name }
    },
  };
});

const getAccessToken = async query => {
  const config = await ServiceConfiguration.configurations.findOneAsync({service: 'meetup'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  const body = OAuth._addValuesToQueryParams({
    code: query.code,
    client_id: config.clientId,
    client_secret: OAuth.openSecret(config.secret),
    grant_type: 'authorization_code',
    redirect_uri: OAuth._redirectUri('meetup', config),
    state: query.state
  });

  return OAuth._fetch('https://secure.meetup.com/oauth2/access', 'POST', {
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/x-www-form-urlencoded',
    },
    body,
  })
    .then(data => data.json())
    .then(data => {
      if (data.error) {
        throw new Error(`Failed to complete OAuth handshake with Meetup. ${data.error.message}`);
      }
      return data;
    })
    .catch(err => {
      throw Object.assign(
        new Error(`Failed to complete OAuth handshake with Meetup. ${err.message}`),
        { response: err.response },
      );
    });
};

const getIdentity = async accessToken => {
  const body = OAuth._addValuesToQueryParams({
    member_id: 'self',
    access_token: accessToken
  });

  return OAuth._fetch('https://api.meetup.com/2/members', 'POST', {
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/x-www-form-urlencoded',
    },
    body,
  }).then(data => data.json())
    .then(({results = []}) => results.length && results[0])
    .catch(err => {
    throw Object.assign(
      new Error(`Failed to fetch identity from Meetup. ${err.message}`),
      { response: err.response }
    );
  });
};

Meetup.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
