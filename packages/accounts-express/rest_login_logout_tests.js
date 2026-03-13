import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { createAuthMiddleware, handleLogin, handleLogout } from 'meteor/accounts-express';
import { Random } from 'meteor/random';
import { WebApp } from 'meteor/webapp';

if (Meteor.isServer) {
  // Helpers
  const createUserWithToken = async () => {
    const username = Random.id();
    const userId = await Accounts.createUser({ username });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);
    return { userId, username, token: stampedToken.token };
  };

  const createUserWithPassword = async (password) => {
    const username = `test_${Random.id()}`;
    const email = `${username}@example.com`;
    const userId = await Accounts.createUser({ username, email, password });
    return { userId, username, email };
  };

  const fetchWithToken = async (url, token, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return Meteor.fetch(url, { ...options, headers, auth: false });
  };

  const postJson = async (url, body, options = {}) => {
    return Meteor.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(body),
      auth: false,
      ...options,
    });
  };

  // --- Setup test routes ---

  Tinytest.addAsync('accounts-express - rest login/logout - setup routes', async (test) => {
    const router = WebApp.express.Router();
    router.use(WebApp.express.json());
    router.post('/login', handleLogin());
    router.post('/logout', createAuthMiddleware({ required: true }), handleLogout());
    WebApp.handlers.use('/api/rest-auth', router);

    // Protected endpoint for verifying tokens work
    WebApp.handlers.get('/api/rest-auth/me',
      createAuthMiddleware({ required: true }),
      (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          meteorUserId: Meteor.userId(),
          reqUserId: req.userId,
        }));
      }
    );

    test.isTrue(true, 'REST auth routes set up');
  });

  // --- Login tests ---

  Tinytest.addAsync('accounts-express - handleLogin - valid email and password', async (test) => {
    const password = Random.secret();
    const { userId, email } = await createUserWithPassword(password);

    try {
      const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        email,
        password,
      });
      test.equal(res.status, 200);

      const data = await res.json();
      test.equal(data.id, userId);
      test.isTrue(typeof data.token === 'string');
      test.isTrue(data.token.length > 0);
      test.isTrue(!!data.tokenExpires);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogin - valid username and password', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      test.equal(res.status, 200);

      const data = await res.json();
      test.equal(data.id, userId);
      test.isTrue(typeof data.token === 'string');
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogin - wrong password', async (test) => {
    const password = Random.secret();
    const { userId } = await createUserWithPassword(password);

    try {
      const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username: (await Meteor.users.findOneAsync(userId)).username,
        password: 'wrong-password',
      });
      test.equal(res.status, 401);

      const data = await res.json();
      test.isTrue(data.error.includes('Invalid credentials'));
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogin - nonexistent user', async (test) => {
    const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
      username: 'nonexistent_user_' + Random.id(),
      password: 'whatever',
    });
    test.equal(res.status, 401);

    const data = await res.json();
    test.isTrue(data.error.includes('Invalid credentials'));
  });

  Tinytest.addAsync('accounts-express - handleLogin - missing password', async (test) => {
    const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
      username: 'someuser',
    });
    test.equal(res.status, 400);
  });

  Tinytest.addAsync('accounts-express - handleLogin - missing email and username', async (test) => {
    const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
      password: 'somepassword',
    });
    test.equal(res.status, 400);
  });

  Tinytest.addAsync('accounts-express - handleLogin - returned token authenticates', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      // Login to get a token
      const loginRes = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      const { token } = await loginRes.json();

      // Use that token to hit a protected endpoint
      const meRes = await fetchWithToken(Meteor.absoluteUrl('api/rest-auth/me'), token);
      test.equal(meRes.status, 200);

      const data = await meRes.json();
      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogin - token expiry matches config', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      const beforeLogin = Date.now();
      const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      const data = await res.json();

      const tokenExpires = new Date(data.tokenExpires).getTime();
      const expectedLifetime = Accounts._getTokenLifetimeMs();

      // tokenExpires should be approximately now + lifetime (within 5 seconds)
      const diff = Math.abs(tokenExpires - (beforeLogin + expectedLifetime));
      test.isTrue(diff < 5000, `Token expiry diff ${diff}ms should be < 5000ms`);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogin - fires onLogin hook', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);
    let hookCalled = false;
    let hookUserId = null;

    const stop = Accounts.onLogin((info) => {
      if (info.type === 'password' && info.user?._id === userId) {
        hookCalled = true;
        hookUserId = info.user._id;
      }
    });

    try {
      await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });

      test.isTrue(hookCalled, 'onLogin hook should have been called');
      test.equal(hookUserId, userId);
    } finally {
      stop.stop();
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogin - fires onLoginFailure hook', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);
    let hookCalled = false;

    const stop = Accounts.onLoginFailure((info) => {
      if (info.type === 'password') {
        hookCalled = true;
      }
    });

    try {
      await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password: 'wrong-password',
      });

      test.isTrue(hookCalled, 'onLoginFailure hook should have been called');
    } finally {
      stop.stop();
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogin - validateLoginAttempt can reject', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    const stop = Accounts.validateLoginAttempt((attempt) => {
      if (attempt.methodName === 'rest-login' && attempt.user?._id === userId) {
        throw new Meteor.Error(403, 'REST login blocked for test');
      }
      return true;
    });

    try {
      const res = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      test.equal(res.status, 403);

      const data = await res.json();
      test.isTrue(data.error.includes('REST login blocked for test'));
    } finally {
      stop.stop();
      await Meteor.users.removeAsync(userId);
    }
  });

  // --- Logout tests ---

  Tinytest.addAsync('accounts-express - handleLogout - valid token', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      // Login first
      const loginRes = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      const { token } = await loginRes.json();

      // Logout
      const logoutRes = await fetchWithToken(
        Meteor.absoluteUrl('api/rest-auth/logout'),
        token,
        { method: 'POST' }
      );
      test.equal(logoutRes.status, 200);

      const data = await logoutRes.json();
      test.equal(data.message, 'Logged out');

      // Token should no longer work
      const meRes = await fetchWithToken(Meteor.absoluteUrl('api/rest-auth/me'), token);
      test.equal(meRes.status, 401);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogout - no auth returns 401', async (test) => {
    const res = await Meteor.fetch(Meteor.absoluteUrl('api/rest-auth/logout'), {
      method: 'POST',
      auth: false,
    });
    test.equal(res.status, 401);
  });

  Tinytest.addAsync('accounts-express - handleLogout - only invalidates specific token', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      // Login twice to get two tokens
      const loginRes1 = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      const { token: token1 } = await loginRes1.json();

      const loginRes2 = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      const { token: token2 } = await loginRes2.json();

      // Logout with token1
      await fetchWithToken(
        Meteor.absoluteUrl('api/rest-auth/logout'),
        token1,
        { method: 'POST' }
      );

      // token1 should be invalid
      const res1 = await fetchWithToken(Meteor.absoluteUrl('api/rest-auth/me'), token1);
      test.equal(res1.status, 401);

      // token2 should still work
      const res2 = await fetchWithToken(Meteor.absoluteUrl('api/rest-auth/me'), token2);
      test.equal(res2.status, 200);

      const data = await res2.json();
      test.equal(data.meteorUserId, userId);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - handleLogout - fires onLogout hook', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);
    let hookCalled = false;
    let hookUserId = null;

    const stop = Accounts.onLogout((info) => {
      if (info.user?._id === userId) {
        hookCalled = true;
        hookUserId = info.user._id;
      }
    });

    try {
      const loginRes = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      const { token } = await loginRes.json();

      await fetchWithToken(
        Meteor.absoluteUrl('api/rest-auth/logout'),
        token,
        { method: 'POST' }
      );

      test.isTrue(hookCalled, 'onLogout hook should have been called');
      test.equal(hookUserId, userId);
    } finally {
      stop.stop();
      await Meteor.users.removeAsync(userId);
    }
  });

  // --- Full lifecycle integration tests ---

  Tinytest.addAsync('accounts-express - integration - login, use token, logout, token rejected', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      // Login
      const loginRes = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      test.equal(loginRes.status, 200);
      const { token } = await loginRes.json();

      // Use token
      const meRes = await fetchWithToken(Meteor.absoluteUrl('api/rest-auth/me'), token);
      test.equal(meRes.status, 200);

      // Logout
      const logoutRes = await fetchWithToken(
        Meteor.absoluteUrl('api/rest-auth/logout'),
        token,
        { method: 'POST' }
      );
      test.equal(logoutRes.status, 200);

      // Token rejected
      const rejectedRes = await fetchWithToken(Meteor.absoluteUrl('api/rest-auth/me'), token);
      test.equal(rejectedRes.status, 401);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync('accounts-express - integration - REST token works for DDP resume', async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      // Get token via REST login
      const loginRes = await postJson(Meteor.absoluteUrl('api/rest-auth/login'), {
        username,
        password,
      });
      const { token } = await loginRes.json();

      // Verify the token exists in the DB as a hashed login token
      const hashedToken = Accounts._hashLoginToken(token);
      const user = await Meteor.users.findOneAsync({
        _id: userId,
        'services.resume.loginTokens.hashedToken': hashedToken,
      });
      test.isTrue(!!user, 'Token should be stored in DB for DDP resume');
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });
}
