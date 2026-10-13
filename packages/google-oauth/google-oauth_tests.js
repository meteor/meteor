Tinytest.addAsync(
  'google-oauth - registerLoginHandler does not persist client-supplied email when Google does not return it',
  async function (test) {
    if (!Meteor.isServer) return;

    const googleUserId = `test-g-${Random.id()}`;
    await ServiceConfiguration.configurations.upsertAsync(
      { service: 'google' },
      { $set: { clientId: 'test', secret: 'test', loginStyle: 'popup' } }
    );

    const oauthMock = mockBehaviours(OAuth, {
      _fetch: (url) => {
        if (url.includes('tokeninfo')) {
          // audience must match the configured clientId so verifyTokenClient
          // accepts this token as issued for this application.
          return Promise.resolve({ json: () => ({ scope: 'profile', audience: 'test' }) });
        }
        // userinfo — sem campo email (scope email não foi concedido)
        return Promise.resolve({ json: () => ({ id: googleUserId, name: 'Test User' }) });
      },
    });

    let result;
    try {
      result = await Accounts._runLoginHandlers({}, {
        googleSignIn: true,
        accessToken: 'valid_token',
        idToken: null,
        userId: googleUserId,
        email: 'vitima@example.com',
        imageUrl: null,
      });
    } finally {
      oauthMock.stop();
    }

    const user = await Meteor.users.findOneAsync({ 'services.google.id': googleUserId });
    if (user) await Meteor.users.removeAsync(user._id);

    test.isTrue(!!result?.userId, 'should complete login');
    test.notEqual(
      user?.services?.google?.email,
      'vitima@example.com',
      'should not persist client-supplied email'
    );
  }
);

Tinytest.addAsync(
  'google-oauth - registerLoginHandler rejects access token issued for a different Google client',
  async function (test) {
    if (!Meteor.isServer) return;

    await ServiceConfiguration.configurations.upsertAsync(
      { service: 'google' },
      { $set: { clientId: 'my_client', secret: 'test', loginStyle: 'popup' } }
    );

    const oauthMock = mockBehaviours(OAuth, {
      _fetch: (url) => {
        if (url.includes('tokeninfo')) {
          // Token was minted for a different (attacker) client.
          return Promise.resolve({ json: () => ({ scope: 'profile', audience: 'ATTACKER_CLIENT' }) });
        }
        return Promise.resolve({ json: () => ({ id: `victim-${Random.id()}`, name: 'Victim' }) });
      },
    });

    let result;
    try {
      result = await Accounts._runLoginHandlers({}, {
        googleSignIn: true,
        accessToken: 'foreign_token',
        idToken: null,
      });
    } finally {
      oauthMock.stop();
    }

    test.isTrue(!!result?.error, 'should return error when token audience does not match clientId');
    test.equal(result.error?.error, 403, 'should reject with a 403 (not issued for this application)');
  }
);

// Logs in through the direct googleSignIn handler with a native SDK access
// token (issued to NATIVE_CLIENT) and the given ID token claims.
const loginWithNativeToken = async ({
  idTokenInfo,
  identityId,
  additionalClientIds,
  idToken = 'native_id_token',
}) => {
  const update = { $set: { clientId: 'web_client', secret: 'test', loginStyle: 'popup' } };
  if (additionalClientIds) {
    update.$set.additionalClientIds = additionalClientIds;
  } else {
    update.$unset = { additionalClientIds: 1 };
  }
  await ServiceConfiguration.configurations.upsertAsync({ service: 'google' }, update);

  const fetchedUrls = [];
  const oauthMock = mockBehaviours(OAuth, {
    _fetch: (url) => {
      fetchedUrls.push(url);
      if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
        return Promise.resolve({ json: () => idTokenInfo });
      }
      if (url.includes('tokeninfo')) {
        return Promise.resolve({ json: () => ({ scope: 'email profile', audience: 'NATIVE_CLIENT' }) });
      }
      return Promise.resolve({ json: () => ({ id: identityId, name: 'Native User' }) });
    },
  });

  let result;
  try {
    result = await Accounts._runLoginHandlers({}, {
      googleSignIn: true,
      accessToken: 'native_access_token',
      idToken,
    });
  } finally {
    oauthMock.stop();
    await ServiceConfiguration.configurations.updateAsync(
      { service: 'google' },
      { $unset: { additionalClientIds: 1 } }
    );
  }

  const user = await Meteor.users.findOneAsync({ 'services.google.id': identityId });
  if (user) await Meteor.users.removeAsync(user._id);

  return { result, user, fetchedUrls };
};

Tinytest.addAsync(
  'google-oauth - registerLoginHandler accepts a native access token paired with an ID token for this app',
  async function (test) {
    if (!Meteor.isServer) return;

    const googleUserId = `native-${Random.id()}`;
    const { result, user } = await loginWithNativeToken({
      identityId: googleUserId,
      idTokenInfo: { aud: 'web_client', sub: googleUserId, iss: 'https://accounts.google.com' },
    });

    test.isFalse(!!result?.error, 'should not return an error');
    test.isTrue(!!result?.userId, 'should complete login');
    test.equal(user?.services?.google?.id, googleUserId);
  }
);

Tinytest.addAsync(
  'google-oauth - registerLoginHandler rejects a native access token whose ID token belongs to another user',
  async function (test) {
    if (!Meteor.isServer) return;

    const { result, user } = await loginWithNativeToken({
      identityId: `victim-${Random.id()}`,
      idTokenInfo: { aud: 'web_client', sub: `attacker-${Random.id()}`, iss: 'accounts.google.com' },
    });

    test.equal(result?.error?.error, 403, 'should reject with a 403');
    test.isFalse(!!user, 'should not create the user');
  }
);

Tinytest.addAsync(
  'google-oauth - registerLoginHandler rejects a native access token whose ID token is for another app',
  async function (test) {
    if (!Meteor.isServer) return;

    const googleUserId = `native-${Random.id()}`;
    const { result: wrongAudience } = await loginWithNativeToken({
      identityId: googleUserId,
      idTokenInfo: { aud: 'ATTACKER_CLIENT', sub: googleUserId, iss: 'https://accounts.google.com' },
    });
    test.equal(wrongAudience?.error?.error, 403, 'should reject an ID token for another client');

    const { result: wrongIssuer } = await loginWithNativeToken({
      identityId: googleUserId,
      idTokenInfo: { aud: 'web_client', sub: googleUserId, iss: 'https://evil.example' },
    });
    test.equal(wrongIssuer?.error?.error, 403, 'should reject an ID token from another issuer');

    const { result: invalidIdToken } = await loginWithNativeToken({
      identityId: googleUserId,
      idTokenInfo: { error: 'invalid_token', error_description: 'Invalid Value' },
    });
    test.equal(invalidIdToken?.error?.error, 403, 'should reject an ID token Google does not accept');

    const { result: noIdToken, fetchedUrls } = await loginWithNativeToken({
      identityId: googleUserId,
      idToken: null,
      idTokenInfo: null,
    });
    test.equal(noIdToken?.error?.error, 403, 'should reject a native token without an ID token');
    test.isFalse(
      fetchedUrls.some(url => url.startsWith('https://oauth2.googleapis.com/tokeninfo')),
      'should not look up a missing ID token'
    );
  }
);

Tinytest.addAsync(
  'google-oauth - registerLoginHandler accepts native access tokens for additionalClientIds',
  async function (test) {
    if (!Meteor.isServer) return;

    const googleUserId = `native-${Random.id()}`;
    const { result, fetchedUrls } = await loginWithNativeToken({
      identityId: googleUserId,
      idToken: null,
      idTokenInfo: null,
      additionalClientIds: ['NATIVE_CLIENT'],
    });

    test.isFalse(!!result?.error, 'should not return an error');
    test.isTrue(!!result?.userId, 'should complete login');
    test.isFalse(
      fetchedUrls.some(url => url.startsWith('https://oauth2.googleapis.com/tokeninfo')),
      'should not need an ID token'
    );
  }
);

Tinytest.addAsync(
  'google-oauth - run service oauth with mocked flow as expected',
  async function (test) {
    const oauthMock = mockBehaviours(OAuth, {
      _fetch: () => Promise.resolve({ json: () => ({ access_token: 'testToken', scope: '1 2 3' })}),
    });

    const service = 'google';
    const serviceMockConfig = { service };
    const mockConfig = { clientId: "test", secret: "test", loginStyle: "popup" };
    if (Meteor.isServer) {
      await ServiceConfiguration.configurations.upsertAsync(serviceMockConfig, { $set: mockConfig });
      const result = await OAuthTest.registeredServices[service].handleOauthRequest({});
      test.isTrue(!!result?.serviceData, 'should return mocked result');
      test.equal(
        oauthMock.mockedRuns.map(({ name }) => name),
        ['openSecret','_redirectUri','_fetch','_fetch','_fetch'],
        'should run mock oauth behaviors',
      );
    } else if (Meteor.isClient) {
      ServiceConfiguration.configurations.insert({ ...serviceMockConfig, ...mockConfig });
      Google.requestCredential({});
      test.equal(
        oauthMock.mockedRuns.map(({ name }) => name),
        ['_loginStyle', '_redirectUri', '_stateParam', 'launchLogin'],
        'should run mock oauth behaviors',
      );
    }

    oauthMock.stop();

    return Promise.resolve();
  },
);
