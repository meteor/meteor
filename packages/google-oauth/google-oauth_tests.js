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
