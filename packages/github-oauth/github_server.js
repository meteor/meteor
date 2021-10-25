Github = {};

OAuth.registerService('github', 2, null, query => {

  const accessTokenCall = Meteor.wrapAsync(getAccessToken);
  const accessToken = accessTokenCall(query);
  const identityCall = Meteor.wrapAsync(getIdentity);
  const identity = identityCall(accessToken);
  const emailsCall = Meteor.wrapAsync(getEmails);
  const emails = emailsCall(accessToken);
  const primaryEmail = emails.find(email => email.primary);

  return {
    serviceData: {
      id: identity.id,
      accessToken: OAuth.sealSecret(accessToken),
      email: identity.email || (primaryEmail && primaryEmail.email) || '',
      username: identity.login,
      emails
    },
    options: {profile: {name: identity.name}}
  };
});

// http://developer.github.com/v3/#user-agent-required
let userAgent = "Meteor";
if (Meteor.release)
  userAgent += `/${Meteor.release}`;

const getAccessToken = async (query) => {
  const config = ServiceConfiguration.configurations.findOne({service: 'github'});
  if (!config)
    throw new ServiceConfiguration.ConfigError();

  let response;
  try {
    const content = new URLSearchParams({
      code: query.code,
      redirect_uri: OAuth._redirectUri('github', config),
      state: query.state
    });
    const request = await fetch(
      `https://github.com/login/oauth/access_token?${content.toString()}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          "User-Agent": userAgent,
          Authorization: `Basic ${config.clientId}:${OAuth.openSecret(config.secret)}`
        }
      });
    response = await request.json();
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to complete OAuth handshake with Github. ${err.message}`),
      { response: err.response },
    );
  }
  if (response.error) { // if the http response was a json object with an error attribute
    throw new Error(`Failed to complete OAuth handshake with GitHub. ${response.error}`);
  } else {
    return response.access_token;
  }
};

const getIdentity = async (accessToken) => {
  try {
    const request = await fetch(
      "https://api.github.com/user", {
        method: 'GET',
        headers: { Accept: 'application/json', "User-Agent": userAgent, "Authorization": `token ${accessToken}`}, // http://developer.github.com/v3/#user-agent-required
      });
    const response = await request.json();
    return response;
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to fetch identity from Github. ${err.message}`),
      { response: err.response }
    );
  }
};

const getEmails = async (accessToken) => {
  try {
    const request = await fetch(
      "https://api.github.com/user/emails", {
        method: 'GET',
        headers: {"User-Agent": userAgent, Accept: 'application/json', "Authorization": `token ${accessToken}`}, // http://developer.github.com/v3/#user-agent-required
      });
    const response = await request.json();
    return response;
  } catch (err) {
    return [];
  }
};

Github.retrieveCredential = (credentialToken, credentialSecret) =>
  OAuth.retrieveCredential(credentialToken, credentialSecret);
