Github = {};

OAuth.registerService('github', 2, null, query => {

  const accessToken = getAccessToken(query);
  const identity = getIdentity(accessToken);
  const emails = getEmails(accessToken);
  const primaryEmail = emails.find(email => email.primary);

  return {
    serviceData: {
      id: identity.id,
      accessToken: OAuth.sealSecret(accessToken),
      email: identity.email || (primaryEmail && primaryEmail.email) || '',
      username: identity.login,
      emails,
    },
    options: {profile: {name: identity.name}}
  };
});

// http://developer.github.com/v3/#user-agent-required
let userAgent = "Meteor";
if (Meteor.release)
  userAgent += `/${Meteor.release}`;

const getAccessToken = query => {
  const config = ServiceConfiguration.configurations.findOne({service: 'github'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    response = fetch(
      "https://github.com/login/oauth/access_token", {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          "User-Agent": userAgent,
          Authorization: `Basic ${config.clientId}:${OAuth.openSecret(config.secret)}`
        },
        params: {
          code: query.code,
          redirect_uri: OAuth._redirectUri('github', config),
          state: query.state
        }
      });
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to complete OAuth handshake with Github. ${err.message}`),
      { response: err.response },
    );
  }
  if (response.data.error) { // if the http response was a json object with an error attribute
    throw new Error(`Failed to complete OAuth handshake with GitHub. ${response.data.error}`);
  } else {
    return response.data.access_token;
  }
};

const getIdentity = accessToken => {
  try {
    return fetch(
      "https://api.github.com/user", {
        method: 'GET',
        headers: {"User-Agent": userAgent, "Authorization": `token ${accessToken}`}, // http://developer.github.com/v3/#user-agent-required
      }).data;
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Github. ${err.message}`),
      { response: err.response },
    );
  }
};

const getEmails = accessToken => {
  try {
    return fetch(
      "https://api.github.com/user/emails", {
        method: 'GET',
        headers: {"User-Agent": userAgent, "Authorization": `token ${accessToken}`}, // http://developer.github.com/v3/#user-agent-required
      }).data;
  } catch (err) {
    return [];
  }
};

Github.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
