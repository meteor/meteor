if (Meteor.isServer) {

  // Test for validateLoginAttempt hook
  Tinytest.addAsync(
    'accounts - validateLoginAttempt prevents login',
    async test => {
      const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
      const stampedToken = Accounts._generateStampedLoginToken();
      await Accounts._insertLoginToken(userId, stampedToken);

      const stopper = Accounts.validateLoginAttempt(() => false);

      const conn = DDP.connect(Meteor.absoluteUrl());
      await test.throwsAsync(
        async () => await conn.callAsync('login', { resume: stampedToken.token }),
        /Login forbidden/
      );

      conn.disconnect();
      stopper.stop();
      await Meteor.users.removeAsync(userId);
    }
  );

  // Test for findUserByEmail
  Tinytest.addAsync(
    'accounts - findUserByEmail with options',
    async test => {
      const email = `test-${Random.id()}@example.com`;
      const userId = await Accounts.insertUserDoc(
        {},
        { emails: [{ address: email, verified: false }], profile: { name: 'Test User' } }
      );

      // Test with field selector
      const user = await Accounts.findUserByEmail(email, { fields: { profile: 1 } });
      test.isTrue(user, 'User should be found');
      test.equal(user.profile.name, 'Test User');
      test.isUndefined(user.emails, 'Emails should not be included');

      // Test case insensitive lookup
      const userUpperCase = await Accounts.findUserByEmail(email.toUpperCase());
      test.isTrue(userUpperCase, 'User should be found with uppercase email');
      test.equal(userUpperCase._id, userId);

      await Meteor.users.removeAsync(userId);
    }
  );

  // Test for findUserByUsername
  Tinytest.addAsync(
    'accounts - findUserByUsername with case insensitivity',
    async test => {
      const username = `testuser${Random.id()}`;
      const userId = await Accounts.insertUserDoc({}, { username });

      // Test case insensitive lookup
      const user = await Accounts.findUserByUsername(username.toUpperCase());
      test.isTrue(user, 'User should be found with uppercase username');
      test.equal(user._id, userId);

      await Meteor.users.removeAsync(userId);
    }
  );

  // Test for _clearAllLoginTokens
  Tinytest.addAsync(
    'accounts - _clearAllLoginTokens',
    async test => {
      const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
      const stampedToken1 = Accounts._generateStampedLoginToken();
      const stampedToken2 = Accounts._generateStampedLoginToken();
      
      await Accounts._insertLoginToken(userId, stampedToken1);
      await Accounts._insertLoginToken(userId, stampedToken2);

      let user = await Meteor.users.findOneAsync(userId);
      test.equal(user.services.resume.loginTokens.length, 2);

      Accounts._clearAllLoginTokens(userId);

      // Wait for the update to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      user = await Meteor.users.findOneAsync(userId);
      test.equal(user.services.resume.loginTokens.length, 0);

      await Meteor.users.removeAsync(userId);
    }
  );

  // Test for _testEmailDomain
  Tinytest.addAsync(
    'accounts - _testEmailDomain with function',
    async test => {
      const originalOptions = Accounts._options;
      
      Accounts._options = {
        restrictCreationByEmailDomain: (email) => email.endsWith('@allowed.com')
      };

      test.isTrue(Accounts._testEmailDomain('user@allowed.com'));
      test.isFalse(Accounts._testEmailDomain('user@notallowed.com'));

      Accounts._options = originalOptions;
    }
  );

  // Test for _testEmailDomain with string
  Tinytest.addAsync(
    'accounts - _testEmailDomain with string',
    async test => {
      const originalOptions = Accounts._options;
      
      Accounts._options = {
        restrictCreationByEmailDomain: 'company.com'
      };

      test.isTrue(Accounts._testEmailDomain('user@company.com'));
      test.isFalse(Accounts._testEmailDomain('user@other.com'));

      Accounts._options = originalOptions;
    }
  );

  // Test for _deleteSavedTokensForUser
  Tinytest.addAsync(
    'accounts - _deleteSavedTokensForUser',
    async test => {
      const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
      const token1 = { hashedToken: Random.id(), when: new Date() };
      const token2 = { hashedToken: Random.id(), when: new Date() };

      await Meteor.users.updateAsync(userId, {
        $set: {
          'services.resume.loginTokens': [token1, token2],
          'services.resume.haveLoginTokensToDelete': true,
          'services.resume.loginTokensToDelete': [token1]
        }
      });

      await Accounts._deleteSavedTokensForUser(userId, [token1]);

      const user = await Meteor.users.findOneAsync(userId);
      test.equal(user.services.resume.loginTokens.length, 1);
      test.equal(user.services.resume.loginTokens[0].hashedToken, token2.hashedToken);
      test.isUndefined(user.services.resume.haveLoginTokensToDelete);
      test.isUndefined(user.services.resume.loginTokensToDelete);

      await Meteor.users.removeAsync(userId);
    }
  );

  // Test for addDefaultRateLimit and removeDefaultRateLimit
  Tinytest.addAsync(
    'accounts - rate limit management',
    async test => {
      const originalRuleId = Accounts.defaultRateLimiterRuleId;
      
      Accounts.removeDefaultRateLimit();
      test.isNull(Accounts.defaultRateLimiterRuleId);

      Accounts.addDefaultRateLimit();
      test.isNotNull(Accounts.defaultRateLimiterRuleId);

      // Restore original state
      if (originalRuleId) {
        Accounts.defaultRateLimiterRuleId = originalRuleId;
      }
    }
  );

  // Test for setDefaultPublishFields
  Tinytest.addAsync(
    'accounts - setDefaultPublishFields',
    async test => {
      const originalFields = Accounts._defaultPublishFields;
      
      const customFields = { username: 1, emails: 1, customField: 1 };
      Accounts.setDefaultPublishFields(customFields);

      test.equal(Accounts._defaultPublishFields.projection, customFields);

      Accounts._defaultPublishFields = originalFields;
    }
  );

  // Test for _handleError
  Tinytest.addAsync(
    'accounts - _handleError with ambiguous messages',
    async test => {
      const originalOptions = Accounts._options;
      
      // Test with ambiguous error messages enabled (default)
      Accounts._options = { ambiguousErrorMessages: true };
      test.throws(
        () => Accounts._handleError('Specific error message'),
        /Something went wrong/
      );

      // Test with ambiguous error messages disabled
      Accounts._options = { ambiguousErrorMessages: false };
      test.throws(
        () => Accounts._handleError('Specific error message'),
        /Specific error message/
      );

      // Test without throwing
      const error = Accounts._handleError('Test error', false);
      test.instanceOf(error, Meteor.Error);

      Accounts._options = originalOptions;
    }
  );

  // Test for _userQueryValidator
  Tinytest.addAsync(
    'accounts - _userQueryValidator',
    async test => {
      // Valid queries
      test.isTrue(Accounts._userQueryValidator.condition({ id: 'userId123' }));
      test.isTrue(Accounts._userQueryValidator.condition({ username: 'testuser' }));
      test.isTrue(Accounts._userQueryValidator.condition({ email: 'test@example.com' }));

      // Invalid queries
      test.throws(() => 
        Accounts._userQueryValidator.condition({ id: 'userId', username: 'testuser' }),
        /exactly one field/
      );
      
      test.throws(() => 
        Accounts._userQueryValidator.condition({}),
        /exactly one field/
      );
    }
  );

  // Test for generateOptionsForEmail
  Tinytest.addAsync(
    'accounts - generateOptionsForEmail',
    async test => {
      const originalTemplates = Accounts.emailTemplates;
      
      Accounts.emailTemplates = {
        from: 'noreply@example.com',
        resetPassword: {
          subject: async (user) => 'Reset your password',
          text: async (user, url) => `Click here to reset: ${url}`,
          html: async (user, url) => `<a href="${url}">Reset password</a>`
        }
      };

      const user = { _id: 'testUserId', emails: [{ address: 'user@example.com' }] };
      const url = 'http://example.com/reset/token123';
      
      const options = await Accounts.generateOptionsForEmail(
        'user@example.com',
        user,
        url,
        'resetPassword'
      );

      test.equal(options.to, 'user@example.com');
      test.equal(options.from, 'noreply@example.com');
      test.equal(options.subject, 'Reset your password');
      test.isTrue(options.text.includes('token123'));
      test.isTrue(options.html.includes('token123'));

      Accounts.emailTemplates = originalTemplates;
    }
  );

  // Test for _reportLoginFailure
  Tinytest.addAsync(
    'accounts - _reportLoginFailure',
    async test => {
      let failureCallbackCalled = false;
      const stopper = Accounts.onLoginFailure(() => {
        failureCallbackCalled = true;
      });

      const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
      
      // Create a mock method invocation
      const mockInvocation = {
        connection: { id: Random.id() }
      };

      const result = {
        type: 'test',
        error: new Meteor.Error(403, 'Test failure'),
        userId: userId
      };

      await Accounts._reportLoginFailure(
        mockInvocation,
        'testMethod',
        ['arg1', 'arg2'],
        result
      );

      test.isTrue(failureCallbackCalled, 'onLoginFailure callback should be called');

      stopper.stop();
      await Meteor.users.removeAsync(userId);
    }
  );
}