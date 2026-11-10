Tinytest.addAsync(
  'facebook-oauth - registerLoginHandler rejects access token from a different Facebook app',
  async function (test) {
    if (!Meteor.isServer) return;

    const appId = 'MY_APP_123';
    await ServiceConfiguration.configurations.upsertAsync(
      { service: 'facebook' },
      { $set: { appId, secret: 'my_secret', loginStyle: 'popup' } }
    );

    const oauthMock = mockBehaviours(OAuth, {
      _fetch: (url) => {
        if (url.includes('debug_token')) {
          return Promise.resolve({ json: () => ({ data: { app_id: 'DIFFERENT_APP', is_valid: true } }) });
        }
        return Promise.resolve({ json: () => ({ id: 'fb-123', name: 'Test User' }) });
      },
    });

    const result = await Accounts._runLoginHandlers({}, {
      facebookSignIn: true,
      accessToken: 'foreign_token',
      expirationTime: 3600,
    });

    oauthMock.stop();

    test.isTrue(!!result?.error, 'should return error when token app_id does not match');
    test.equal(result.error?.error, 403, 'should reject with a 403 (not issued for this application)');
  }
);

Tinytest.addAsync(
  'facebook-oauth - registerLoginHandler accepts access token from the correct Facebook app',
  async function (test) {
    if (!Meteor.isServer) return;

    const appId = 'MY_APP_123';
    const facebookUserId = `test-fb-${Random.id()}`;
    await ServiceConfiguration.configurations.upsertAsync(
      { service: 'facebook' },
      { $set: { appId, secret: 'my_secret', loginStyle: 'popup' } }
    );

    const oauthMock = mockBehaviours(OAuth, {
      _fetch: (url) => {
        if (url.includes('debug_token')) {
          return Promise.resolve({ json: () => ({ data: { app_id: appId, is_valid: true } }) });
        }
        return Promise.resolve({ json: () => ({ id: facebookUserId, name: 'Test User' }) });
      },
    });

    let error;
    let result;
    try {
      result = await Accounts._runLoginHandlers({}, {
        facebookSignIn: true,
        accessToken: 'valid_token',
        expirationTime: 3600,
      });
    } catch (e) {
      error = e;
    }

    oauthMock.stop();

    if (result?.userId) {
      await Meteor.users.removeAsync(result.userId);
    }

    test.isUndefined(error, 'should not throw for correct app token');
    test.isTrue(!!result?.userId, 'should return a userId');
  }
);

Tinytest.addAsync(
  'facebook-oauth - run service oauth with mocked flow as expected',
  async function (test) {
    const oauthMock = mockBehaviours(OAuth, {
      _fetch: () => Promise.resolve({ json: () => ({ access_token: 'testToken' })}),
    });

    const service = 'facebook';
    const serviceMockConfig = { service };
    const mockConfig = { clientId: "test", secret: "test", loginStyle: "popup" };
    if (Meteor.isServer) {
      await ServiceConfiguration.configurations.upsertAsync(serviceMockConfig, { $set: mockConfig });
      const result = await OAuthTest.registeredServices[service].handleOauthRequest({});
      test.isTrue(!!result?.serviceData, 'should return mocked result');
      test.equal(
        oauthMock.mockedRuns.map(({ name }) => name),
        ['_redirectUri','openSecret','_fetch','openSecret','_fetch'],
        'should run mock oauth behaviors',
      );
    } else if (Meteor.isClient) {
      ServiceConfiguration.configurations.insert({ ...serviceMockConfig, ...mockConfig });
      Facebook.requestCredential({});
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
