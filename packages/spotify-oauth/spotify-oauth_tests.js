Tinytest.addAsync(
  'spotify-oauth - run service oauth with mocked flow as expected',
  async function (test) {
    const oauthMock = mockBehaviours(OAuth, {
      _fetch: () => Promise.resolve({ json: () => ({ access_token: 'testToken', refresh_token: 'testRefresh', expires_in: 3600, display_name: 'Test', id: '123', images: [] })}),
    });

    const service = 'spotify';
    const serviceMockConfig = { service };
    const mockConfig = { clientId: "test", secret: "test", loginStyle: "popup" };
    if (Meteor.isServer) {
      await ServiceConfiguration.configurations.upsertAsync(serviceMockConfig, { $set: mockConfig });
      const result = await OAuthTest.registeredServices[service].handleOauthRequest({});
      test.isTrue(!!result?.serviceData, 'should return mocked result');
      test.equal(
        oauthMock.mockedRuns.map(({ name }) => name),
        ['_redirectUri', '_fetch', '_fetch', 'sealSecret', 'sealSecret'],
        'should run mock oauth behaviors',
      );
    } else if (Meteor.isClient) {
      ServiceConfiguration.configurations.insert({ ...serviceMockConfig, ...mockConfig });
      Spotify.requestCredential({});
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
