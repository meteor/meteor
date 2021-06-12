import { URL } from 'meteor/url';
import { fetch, Request, Headers } from 'meteor/fetch';

OAuth.registerService("meteor-developer", 2, null, query => {
  const responseCall = Meteor.wrapAsync(getTokens);
  let response
  try {
    response = responseCall(query);
  } catch (err) {
    throw Object.assign(
      new Error(
        "Failed to complete OAuth handshake with Meteor developer accounts. "
        + err.message
      ),
      {response: err.response}
    );
  }
  const { accessToken } = response;
  const identityCall = Meteor.wrapAsync(getIdentity);
  let identity;
  try {
    identity = identityCall(accessToken);
  } catch (err) {
    throw Object.assign(
      new Error("Failed to fetch identity from Meteor developer accounts. " +
        err.message),
      {response: err.response}
    );
  }

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

  const searchParams = {
    grant_type: "authorization_code",
    code: query.code,
    client_id: config.clientId,
    client_secret: OAuth.openSecret(config.secret),
    redirect_uri: OAuth._redirectUri('meteor-developer', config)
  };
  const url = new URL(MeteorDeveloperAccounts._server + "/oauth2/token")
  Object.keys(searchParams).forEach(key => {
    url.searchParams.append(key, searchParams[key]);
  });
  const request = new Request(url, {
    method: 'POST',
    redirect: 'follow',
    mode: 'cors',
    jar: false
  })
  const response = await fetch(request);
  const data = await response.json();

  if (data.error || Object.keys(data) === 0) {
    // if the http response was a json object with an error attribute
    throw new Error(
      "Failed to complete OAuth handshake with Meteor developer accounts. " +
        data.error || "No response data"
    );
  } else {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
  }
};

const getIdentity = async (accessToken) => {
    const request = await fetch(
    `${MeteorDeveloperAccounts._server}/api/v1/identity`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`}
    });
    const response = await request.json();
    return response.data;
};

MeteorDeveloperAccounts.retrieveCredential =
  (credentialToken, credentialSecret) =>
    OAuth.retrieveCredential(credentialToken, credentialSecret);
