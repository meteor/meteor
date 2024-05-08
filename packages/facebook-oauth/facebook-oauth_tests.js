Tinytest.addAsync(
  'facebook-oauth - run service oauth with mocked flow as expected',
  async function (test) {
    const oauthMock = disableBehaviours(OAuth, {
      _fetch: () => Promise.resolve({ json: () => ({})}),
    });

    const serviceMockConfig = { service: 'facebook' };
    const mockConfig = { clientId: "test", secret: "test", loginStyle: "popup" };
    if (Meteor.isServer) {
      await ServiceConfiguration.configurations.upsertAsync(serviceMockConfig, { $set: mockConfig });
      const result = await Facebook.handleAuthFromAccessToken('testToken');
      test.isTrue(!!result?.serviceData, 'should return mocked result');
      test.equal(
        oauthMock.disabledRuns.map(({ name }) => name),
        ['openSecret', '_fetch'],
        'should run mock oauth behaviors',
      );
    } else if (Meteor.isClient) {
      ServiceConfiguration.configurations.insert({ ...serviceMockConfig, ...mockConfig });
      Facebook.requestCredential({});
      test.equal(
        oauthMock.disabledRuns.map(({ name }) => name),
        ['_loginStyle', '_redirectUri', '_stateParam', 'launchLogin'],
        'should run mock oauth behaviors',
      );
    }

    oauthMock.stop();

    return Promise.resolve();
  },
);
