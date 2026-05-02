import {Accounts} from "meteor/accounts-base";
import { AccountsClient } from './accounts_client';

const username = 'jsmith';
const password = 'password';
const excludeField = 'excludeField';
const defaultExcludeField = 'defaultExcludeField';
const excludeValue = 'foo';
const secret2fa = 'shhhh';
const profile = {
  name: username,
  [excludeField]: excludeValue,
  [defaultExcludeField]: excludeValue,
};

const logoutAndCreateUser = (test, done, nextTests) => {
  Meteor.logout(() => {
    // Make sure we're logged out to start with
    test.isFalse(Meteor.user());

    // Setup a new test user
    Accounts.createUser({ username, password, profile }, () => {
      // Handle next tests
      nextTests(test, done);
    });
  });
};

const createUserAndLogout = (test, done, nextTests) => {
  // Setup a new test user
  Accounts.createUser(
    {
      username,
      password,
      profile: {
        name: username,
      },
    },
    () => {
      Meteor.logout(async () => {
        // Make sure we're logged out
        test.isFalse(await Meteor.userAsync());
        // Handle next tests
        nextTests(test, done);
      });
    }
  );
};

const removeTestUser = done => {
  Meteor.callAsync('removeAccountsTestUser', username).then(() => {
    done();
  });
};

const forceEnableUser2fa = done => {
  Meteor.callAsync('forceEnableUser2fa', { username }, secret2fa).then((token) => {
    done(token);
  });
};

const getTokenFromSecret = done => {
  Meteor.call(
    'getTokenFromSecret',
    { selector: { username } },
    (err, token) => {
      done(token);
    }
  );
};

Tinytest.addAsync(
  'accounts - Meteor.loggingIn() is true right after a login call',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Login then immediately verify loggingIn is true
      Meteor.loginWithPassword(username, password);
      test.isTrue(Meteor.loggingIn());
      removeTestUser(done);
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.loggingIn() is false after login has completed',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Login then verify loggingIn is false after login has completed
      Meteor.loginWithPassword(username, password, () => {
        test.isTrue(Meteor.user());
        test.isFalse(Meteor.loggingIn());
        removeTestUser(done);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts async - Meteor.loggingIn() is false after login has completed',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      Meteor.loginWithPasswordAsync(username, password)
        .then(async (loginDetails) => {
          test.isFalse(Meteor.loggingIn());
          test.isTrue(await Meteor.userAsync());
          test.equal(loginDetails.type, 'password');
          test.equal(loginDetails.id, Meteor.userId());
          test.isTrue(!!loginDetails.token);
        })
        .catch(error => test.fail(error.message))
        .finally(() => removeTestUser(done));
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.loggingOut() is true right after a logout call',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Logout then immediately verify loggingOut is true
      Meteor.logout();
      test.isTrue(Meteor.loggingOut());
      removeTestUser(done);
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.loggingOut() is false after logout has completed',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      Meteor.logoutAsync()
        .then(async () => {
          test.isFalse(await Meteor.userAsync());
          test.isFalse(Meteor.loggingOut());
        })
        .catch(error => test.fail(error.message))
        .finally(() => removeTestUser(done));
    });
  }
);

Tinytest.addAsync(
  'accounts - onLogin callback receives { type: "password" } param on login',
  (test, done) => {
    const onLogin = Accounts.onLogin((loginDetails) => {
      test.equal('password', loginDetails.type);
      onLogin.stop();
      removeTestUser(done);
    });
    logoutAndCreateUser(test, done, () => {});
  }
);

Tinytest.addAsync(
  'accounts - onLogin non-async callback works correctly',
  (test, done) => {
    const onLogin = Accounts.onLogin((loginDetails) => {
      // Non-async callback — should still work with forEachAsync
      test.isTrue(loginDetails !== undefined);
      test.equal('password', loginDetails.type);
      onLogin.stop();
      removeTestUser(done);
    });
    logoutAndCreateUser(test, done, () => {
      Meteor.loginWithPassword(username, password, (err) => {
        test.isFalse(!!err);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts async - onLogin async callback works correctly',
  (test, done) => {
    const onLogin = Accounts.onLogin(async (loginDetails) => {
      const user = await Meteor.userAsync();
      test.isTrue(user !== undefined);
      test.equal('password', loginDetails.type);
      onLogin.stop();
      removeTestUser(done);
    });
    logoutAndCreateUser(test, done, () => {
      Meteor.loginWithPassword(username, password, (err) => {
        test.isFalse(!!err);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts - onLoginFailure non-async callback works correctly',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      Meteor.logout(() => {
        const onLoginFailure = Accounts.onLoginFailure(({ error }) => {
          test.isTrue(error !== undefined);
          onLoginFailure.stop();
          removeTestUser(done);
        });
        Meteor.loginWithPassword(username, 'wrongpassword', (err) => {
          test.isTrue(!!err);
        });
      });
    });
  }
);

Tinytest.addAsync(
  'accounts async - onLoginFailure async callback works correctly',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      Meteor.logout(async () => {
        const onLoginFailure = Accounts.onLoginFailure(async ({ error }) => {
          test.isTrue(error !== undefined);
          const user = await Meteor.userAsync();
          test.isFalse(!!user);
          onLoginFailure.stop();
          removeTestUser(done);
        });
        Meteor.loginWithPassword(username, 'wrongpassword', (err) => {
          test.isTrue(!!err);
        });
      });
    });
  }
);

Tinytest.addAsync(
  'accounts - onLogout non-async callback works correctly',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      const onLogout = Accounts.onLogout(() => {
        // callback fired — logout hook works with sync function
        onLogout.stop();
        removeTestUser(done);
      });
      Meteor.logout();
    });
  }
);

Tinytest.addAsync(
  'accounts async - onLogout async callback works correctly',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      const onLogout = Accounts.onLogout(async () => {
        // onLogout fires before setUserId(null), so user is still available
        const user = await Meteor.userAsync();
        test.isTrue(!!user);
        onLogout.stop();
        removeTestUser(done);
      });
      Meteor.logout();
    });
  }
);

Tinytest.addAsync(
  'accounts async - onLogout async callback failure still logs out client',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      const onLogout = Accounts.onLogout(async () => {
        onLogout.stop();
        throw new Error('Expected onLogout failure');
      });

      Meteor.logout(async (error) => {
        test.equal(error?.message, 'Expected onLogout failure');
        test.isFalse(!!(await Meteor.userAsync()));
        test.isFalse(Meteor.loggingOut());
        removeTestUser(done);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts async - async userCallback completes its async work',
  (test, done) => {
    logoutAndCreateUser(test, done, async () => {
      await new Promise((resolve, reject) => {
        Meteor.logout(() => {
          Meteor.loginWithPassword(username, password, (err) => {
            void (async () => {
              test.isFalse(!!err);
              const user = await Meteor.userAsync();
              test.isTrue(!!user);
              resolve();
            })().catch(reject);
          });
        });
      });

      removeTestUser(done);
    });
  }
);

Tinytest.addAsync(
  'accounts async - onLogin callback failure does not leave Meteor.loggingIn() stuck',
  async test => {
    const rejectionMessage = 'Expected onLogin failure';
    const handleUnhandledRejection = event => {
      if (event.reason?.message === rejectionMessage) {
        event.preventDefault();
      }
    };
    const logout = () => new Promise(resolve => Meteor.logout(resolve));

    globalThis.addEventListener?.('unhandledrejection', handleUnhandledRejection);

    let onLogin;
    try {
      await logout();
      test.isFalse(await Meteor.userAsync());

      await new Promise((resolve, reject) => {
        Accounts.createUser({ username, password, profile }, error => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await logout();
      test.isFalse(await Meteor.userAsync());

      onLogin = Accounts.onLogin(async () => {
        onLogin.stop();
        await Promise.resolve();
        throw new Error(rejectionMessage);
      });

      Meteor.loginWithPassword(username, password, error => {
        test.isFalse(!!error);
      });

      await waitUntil(async () => !!(await Meteor.userAsync()), {
        timeout: 5000,
        interval: 50,
        description: 'waiting for login before checking Meteor.loggingIn()',
      });
      await new Promise(resolve => Meteor.setTimeout(resolve, 0));

      test.isFalse(Meteor.loggingIn());
    } finally {
      onLogin?.stop();
      globalThis.removeEventListener?.('unhandledrejection', handleUnhandledRejection);
      await logout();
      await Meteor.callAsync('removeAccountsTestUser', username);
    }
  }
);

Tinytest.addAsync(
  'accounts - onLogin callback receives { type: "resume" } param on ' +
  'reconnect, if already logged in',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      const onLogin = Accounts.onLogin((loginDetails) => {
        test.equal('resume', loginDetails.type);
        onLogin.stop();
        removeTestUser(done);
      });

      Meteor.disconnect();
      Meteor.reconnect();
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.user() obeys explicit and default field selectors',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      Meteor.loginWithPassword(username, password, () => {
        // by default, all fields should be returned
        test.equal(Meteor.user().profile[excludeField], excludeValue);

        // this time we want to exclude the default fields
        const options = Accounts._options;
        Accounts._options = {};
        Accounts.config({defaultFieldSelector: {['profile.'+defaultExcludeField]: 0}});
        let user = Meteor.user();
        test.isUndefined(user.profile[defaultExcludeField]);
        test.equal(user.profile[excludeField], excludeValue);
        test.equal(user.profile.name, username);

        // this time we only want certain fields...
        user = Meteor.user({fields: {'profile.name': 1}});
        test.isUndefined(user.profile[excludeField]);
        test.isUndefined(user.profile[defaultExcludeField]);
        test.equal(user.profile.name, username);
        Accounts._options = options;
        removeTestUser(done);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts async - Meteor.userAsync() obeys explicit and default field selectors',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      Meteor.loginWithPassword(username, password, async () => {
        // by default, all fields should be returned
        let user;
        user = await Meteor.userAsync();
        test.equal(user.profile[excludeField], excludeValue);

        // this time we want to exclude the default fields
        const options = Accounts._options;
        Accounts._options = {};
        Accounts.config({ defaultFieldSelector: { ['profile.' + defaultExcludeField]: 0 } });

        user = await Meteor.userAsync();
        test.isUndefined(user.profile[defaultExcludeField]);
        test.equal(user.profile[excludeField], excludeValue);
        test.equal(user.profile.name, username);

        // this time we only want certain fields...

        user = await Meteor.userAsync({ fields: { 'profile.name': 1 } });
        test.isUndefined(user.profile[excludeField]);
        test.isUndefined(user.profile[defaultExcludeField]);
        test.equal(user.profile.name, username);
        Accounts._options = options;
        removeTestUser(done);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts-2fa - Meteor.loginWithPasswordAnd2faCode() fails when token is not provided',
  (test, done) => {
    createUserAndLogout(test, done, () => {
      try {
        Meteor.loginWithPasswordAnd2faCode(username, password);
      } catch (e) {
        test.equal(
          e.reason,
          'token is required to use loginWithPasswordAnd2faCode and must be a string'
        );
      } finally {
        test.isFalse(Meteor.user());
        removeTestUser(done);
      }
    });
  }
);


 Tinytest.addAsync(
  'accounts-2fa - Meteor.loginWithPasswordAnd2faCode() fails with invalid code',
  (test, done) => {
    createUserAndLogout(test, done, () => {
      forceEnableUser2fa(() => {
        Meteor.loginWithPasswordAnd2faCode(username, password, 'ABC', async e => {
          test.isFalse(await Meteor.user());
          test.equal(e.reason, 'Invalid 2FA code');
          removeTestUser(done);
        });
      });
    });
  }
);

Tinytest.addAsync(
  'accounts-2fa - Meteor.loginWithPasswordAnd2faCode() succeeds when token is correct',
  (test, done) => {
    createUserAndLogout(test, done, () => {
      forceEnableUser2fa((token) => {
        Meteor.loginWithPasswordAnd2faCode(username, password, token, e => {
          test.equal(e, undefined);
          test.isTrue(Meteor.user());
          removeTestUser(done);
        });
      });
    });
  }
);

Tinytest.addAsync(
  'accounts-2fa - Generates secret, enable 2fa, verifies if 2fa is enabled, disable 2fa, verifies if 2fa is disabled',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Generates secret
      Accounts.generate2faActivationQrCode('test', (err, result) => {
        test.equal(err, undefined);
        test.isTrue(!!result);
        test.isTrue(result?.svg != null);
        test.isTrue(/^[A-Z2-7]+$/.test(result?.secret || ''));
        test.isTrue(/^otpauth:\/\/totp\/.+[?&]secret=/.test(result?.uri || ''));
        test.isTrue((result?.uri || '').includes(`secret=${result?.secret}`));

        if (!result) {
          removeTestUser(done);
          return;
        }

        getTokenFromSecret(token => {
          // enable 2fa
          Accounts.enableUser2fa(token, () => {
            // verifies if 2fa is enabled
            Accounts.has2faEnabled((err, isEnabled) => {
              test.isTrue(isEnabled);
              // disable 2fa
              Accounts.disableUser2fa(() => {
                // verifies if 2fa is disabled
                Accounts.has2faEnabled((err, isEnabled) => {
                  test.isFalse(!!isEnabled);
                  removeTestUser(done);
                });
              });
            });
          });
        });
      });
    });
  },
);

Tinytest.addAsync('accounts - logoutAllClients', function (test, done) {
  logoutAndCreateUser(test, done, async () => {
    const userId = Meteor.userId();
    test.equal(await Meteor.callAsync('getLoginTokenCount', userId), 1);
    await Meteor.callAsync('pushFakeLoginToken', userId, 'test-token');
    await Meteor.callAsync('pushFakeLoginToken', userId, 'test-token2');
    test.equal(await Meteor.callAsync('getLoginTokenCount', userId), 3);
    Meteor.logoutAllClientsAsync()
      .then(async () => {
        test.isFalse(!!Meteor.user());
        test.equal(await Meteor.callAsync('getLoginTokenCount', userId), 0);
      })
      .catch(error => test.fail(error.message))
      .finally(() => removeTestUser(done));
  });
});

Tinytest.addAsync('accounts - storage', async function (test) {
  const expectWhenSessionStorage = () => {
    test.isNotUndefined(sessionStorage.getItem('Meteor.loginToken'));
    test.isNull(localStorage.getItem('Meteor.loginToken'));
  };
  const expectWhenLocalStorage = () => {
    test.isNotUndefined(localStorage.getItem('Meteor.loginToken'));
    test.isNull(sessionStorage.getItem('Meteor.loginToken'));
  };

  const testCases = [{
      clientStorage: undefined,
      expectStorage: expectWhenLocalStorage,
    },
    {
      clientStorage: 'local',
      expectStorage: expectWhenLocalStorage,
  }, {
    clientStorage: 'session',
    expectStorage: expectWhenSessionStorage,
  }];
  for await (const testCase of testCases) {
    await new Promise(resolve => {
      sessionStorage.clear();
      localStorage.clear();

      const { clientStorage, expectStorage } = testCase;
      Accounts.config({ clientStorage });
      test.equal(Accounts._options.clientStorage, clientStorage);

      // Login a user and test that tokens are in expected storage
      logoutAndCreateUser(test, resolve, () => {
        Accounts.logout();
        expectStorage();
        removeTestUser(resolve);
      });
    });
  }
});

Tinytest.addAsync('accounts - should only start subscription when connected', async function (test) {
  const { conn, messages, cleanup } = await captureConnectionMessagesClient(test);

  const acc = new AccountsClient({
    connection: conn,
  })

  acc.callLoginMethod()

  await Meteor._sleepForMs(500);

  // The sub call needs to come right after `connect` since this is when `status().connected` gets to be true and
  // not after `connected` as it is based on the socket connection status.
  const expectedMessages = ['connect', 'method', 'sub', 'connected', 'updated', 'result', 'ready']

  const parsedMessages = messages.map(m => m.msg).filter(Boolean).filter(m => m !== 'added')

  test.equal(parsedMessages, expectedMessages)

  cleanup()
});
