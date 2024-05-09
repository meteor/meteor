Tinytest.addAsync(
  'meteor-developer-oauth - run service oauth with mocked flow as expected',
  async function (test) {
    const oauthMock = disableBehaviours(OAuth, {
      _fetch: () => Promise.resolve({ json: () => ({ access_token: 'testToken' })}),
    });

    const service = 'meteor-developer';
    const serviceMockConfig = { service };
    const mockConfig = { clientId: "test", secret: "test", loginStyle: "popup" };
    if (Meteor.isServer) {
      await ServiceConfiguration.configurations.upsertAsync(serviceMockConfig, { $set: mockConfig });
      const result = await OAuthTest.registeredServices[service].handleOauthRequest({});
      test.isTrue(!!result?.serviceData, 'should return mocked result');
      test.equal(
        oauthMock.disabledRuns.map(({ name }) => name),
        ['openSecret','_redirectUri','_addValuesToQueryParams','_fetch','_fetch','sealSecret'],
        'should run mock oauth behaviors',
      );
    } else if (Meteor.isClient) {
      ServiceConfiguration.configurations.insert({ ...serviceMockConfig, ...mockConfig });
      MeteorDeveloperAccounts.requestCredential({});
      test.equal(
        oauthMock.disabledRuns.map(({ name }) => name),
        ['_loginStyle','_stateParam','_redirectUri','launchLogin'],
        'should run mock oauth behaviors',
      );
    }

    oauthMock.stop();

    return Promise.resolve();
  },
);
