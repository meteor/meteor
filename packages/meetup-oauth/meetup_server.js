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

const toFormUrlencoded = data => {
  return Object.entries(data)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
};

const getAccessToken = async query => {
  const config = ServiceConfiguration.configurations.findOne({service: 'meetup'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  const bodyFormEncoded = toFormUrlencoded({
    code: query.code,
    client_id: config.clientId,
    client_secret: OAuth.openSecret(config.secret),
    grant_type: 'authorization_code',
    redirect_uri: OAuth._redirectUri('meetup', config),
    state: query.state
  });

  return await fetch('https://secure.meetup.com/oauth2/access', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/x-www-form-urlencoded',
    },
    body: bodyFormEncoded,
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
  const bodyFormEncoded = toFormUrlencoded({
    member_id: 'self',
    access_token: accessToken
  });

  return await fetch('https://api.meetup.com/2/members', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/x-www-form-urlencoded',
    },
    body: bodyFormEncoded,
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
