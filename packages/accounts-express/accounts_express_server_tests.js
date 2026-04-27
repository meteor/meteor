import { Meteor } from 'meteor/meteor';
import { Accounts, _CurrentEndpointInvocation } from 'meteor/accounts-base';
import { createAuthMiddleware, createAuthFetch } from 'meteor/accounts-express';
import { Random } from 'meteor/random';
import { WebApp } from 'meteor/webapp';

// Tests for Express middleware authentication
if (Meteor.isServer) {
  // Helper function to create a test user with a login token
  const createUserWithToken = async () => {
    const username = Random.id();
    const userId = await Accounts.createUser({ username });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);
    return { userId, username, token: stampedToken.token };
  };

  // Helper: fetch with explicit Bearer token (auth: false to skip auto-auth, manual header)
  const fetchWithToken = async (url, token, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return Meteor.fetch(url, { ...options, headers, auth: false });
  };

  // Helper: fetch with cookie
  const fetchWithCookie = async (url, token, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers['Cookie'] = `meteor_login_token=${token}`;
    }
    return Meteor.fetch(url, { ...options, headers, auth: false });
  };

  // Helper: set cookie via endpoint and extract the cookie value from Set-Cookie header
  const setCookieForToken = async (token) => {
    const res = await Meteor.fetch(Meteor.absoluteUrl('_accounts/cookie/set'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      auth: false,
    });
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? setCookie.split(';')[0] : null; // e.g. "meteor_login_token=abc123"
  };

  // Setup test routes
  Tinytest.addAsync('accounts-express - createAuthMiddleware - setup test routes', async (test) => {
    // Route with auth middleware that returns 401 for unauthenticated requests
    WebApp.handlers.use('/api/express-test-auth', createAuthMiddleware({ required: true }));

    // Create a separate router for the optional authentication route
    const optionalAuthRouter = WebApp.express.Router();

    // Apply optional authentication middleware to the router
    optionalAuthRouter.use(createAuthMiddleware({ required: false }));

    // Define the route handler on the router
    optionalAuthRouter.get('/', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        meteorUserId: Meteor.userId(),
        reqUserId: req.userId,
        authenticated: !!Meteor.userId()
      }));
    });

    // Mount the router at a path that isn't a sub-path of '/api/express-test-auth'
    WebApp.handlers.use('/api/express-test-auth-optional', optionalAuthRouter);

    // Simple route that returns user info
    WebApp.handlers.get('/api/express-test-auth', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        meteorUserId: Meteor.userId(),
        reqUserId: req.userId,
        isSame: Meteor.userId() === req.userId
      }));
    });

    // Route with multiple middleware layers
    WebApp.handlers.get('/api/express-test-auth/stacked',
      (req, res, next) => {
        req.middlewareTest = 'passed';
        next();
      },
      createAuthMiddleware({ required: true }),
      (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          meteorUserId: Meteor.userId(),
          reqUserId: req.userId,
          middlewareTest: req.middlewareTest,
          isSame: Meteor.userId() === req.userId
        }));
      }
    );

    // Route with prefix-mounted middleware
    const prefixRouter = WebApp.express.Router();
    prefixRouter.use(createAuthMiddleware({ required: true }));
    prefixRouter.get('/', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        meteorUserId: Meteor.userId(),
        reqUserId: req.userId,
        isSame: Meteor.userId() === req.userId
      }));
    });
    WebApp.handlers.use('/api/express-test-auth/prefix', prefixRouter);

    // Echo route for server fetch tests
    WebApp.handlers.get('/api/express-test-request-echo', createAuthMiddleware({ required: false }), (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        meteorUserId: Meteor.userId(),
        reqUserId: req.userId,
      }));
    });

    // Forwarding route for context token test
    WebApp.handlers.get('/api/express-test-request-forward',
      createAuthMiddleware({ required: true }),
      async (req, res) => {
        // Inside this handler, _CurrentEndpointInvocation has the loginToken
        // Meteor.fetch() should auto-read it
        const innerResponse = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-request-echo'));
        const innerData = await innerResponse.json();

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          outerUserId: Meteor.userId(),
          innerUserId: innerData.meteorUserId,
        }));
      }
    );

    test.isTrue(true, 'Test routes set up successfully');
  });

  // Test unauthenticated requests
  Tinytest.addAsync('accounts-express - createAuthMiddleware - unauthenticated requests', async (test) => {
    // Make request without auth token to required auth route
    const requiredRes = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth'), { auth: false });
    test.equal(requiredRes.status, 401);
    const requiredData = await requiredRes.json();
    test.isTrue(requiredData.error.includes('Unauthorized'));

    // Test optional authentication route with no auth
    const optionalRes = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth-optional'), { auth: false });
    test.equal(optionalRes.status, 200);
    const optionalData = await optionalRes.json();

    // Verify unauthenticated state
    test.isNull(optionalData.meteorUserId);
    test.isFalse(optionalData.authenticated);
  });

  // Test valid authentication
  Tinytest.addAsync('accounts-express - createAuthMiddleware - valid authentication', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      // Make request with valid auth token to required auth route
      const response = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth'), token);
      test.equal(response.status, 200);

      const data = await response.json();
      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
      test.isTrue(data.isSame);

      // Test optional authentication route with valid auth
      const optionalRes = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth-optional'), token);
      test.equal(optionalRes.status, 200);

      const optionalData = await optionalRes.json();
      test.equal(optionalData.meteorUserId, userId);
      test.equal(optionalData.reqUserId, userId);
      test.isTrue(optionalData.authenticated);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test invalid/malformed authentication
  Tinytest.addAsync('accounts-express - createAuthMiddleware - invalid authentication', async (test) => {
    // Test with invalid token on required auth route
    const invalidRes = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth'), 'invalid-token');
    test.equal(invalidRes.status, 401);
    const invalidData = await invalidRes.json();
    test.isTrue(invalidData.error.includes('Invalid token'));

    // Test with malformed token (wrong format) on required auth route
    const malformedRes = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth'), {
      headers: { 'Authorization': 'NotBearer token' },
      auth: false,
    });
    test.equal(malformedRes.status, 401);
    const malformedData = await malformedRes.json();
    test.isTrue(malformedData.error.includes('Unauthorized'));

    // Test with token for nonexistent user on required auth route
    const { userId, token } = await createUserWithToken();
    await Meteor.users.removeAsync(userId); // Remove the user but keep the token

    const nonexistentRes = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth'), token);
    test.equal(nonexistentRes.status, 401);
    const nonexistentData = await nonexistentRes.json();
    test.isTrue(nonexistentData.error.includes('Invalid token'));

    // Test with invalid token on optional auth route
    const invalidOptRes = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth-optional'), 'invalid-token');
    test.equal(invalidOptRes.status, 200);
    const invalidOptData = await invalidOptRes.json();
    test.isNull(invalidOptData.meteorUserId);
    test.isFalse(invalidOptData.authenticated);

    // Test with malformed token on optional auth route
    const malformedOptRes = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth-optional'), {
      headers: { 'Authorization': 'NotBearer token' },
      auth: false,
    });
    test.equal(malformedOptRes.status, 200);
    const malformedOptData = await malformedOptRes.json();
    test.isNull(malformedOptData.meteorUserId);
    test.isFalse(malformedOptData.authenticated);

    // Test with token for nonexistent user on optional auth route
    const nonexistentOptRes = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth-optional'), token);
    test.equal(nonexistentOptRes.status, 200);
    const nonexistentOptData = await nonexistentOptRes.json();
    test.isNull(nonexistentOptData.meteorUserId);
    test.isFalse(nonexistentOptData.authenticated);
  });

  // Test token/session mismatch (Bearer header takes precedence over cookie)
  Tinytest.addAsync('accounts-express - createAuthMiddleware - token/session mismatch', async (test) => {
    const user1 = await createUserWithToken();
    const user2 = await createUserWithToken();

    try {
      // Test with conflicting credentials (header token from user1, cookie token from user2)
      // The implementation should prioritize Bearer header over cookie
      const response = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth'), {
        headers: {
          'Authorization': `Bearer ${user1.token}`,
          'Cookie': `meteor_login_token=${user2.token}`,
        },
        auth: false,
      });
      test.equal(response.status, 200);

      const data = await response.json();
      // Verify that Bearer header takes precedence
      test.equal(data.meteorUserId, user1.userId);
      test.equal(data.reqUserId, user1.userId);
      test.isTrue(data.isSame);

      // Verify that cookie-only auth works
      const cookieRes = await fetchWithCookie(Meteor.absoluteUrl('api/express-test-auth'), user2.token);
      test.equal(cookieRes.status, 200);

      const cookieData = await cookieRes.json();
      test.equal(cookieData.meteorUserId, user2.userId);
      test.equal(cookieData.reqUserId, user2.userId);
      test.isTrue(cookieData.isSame);
    } finally {
      await Meteor.users.removeAsync(user1.userId);
      await Meteor.users.removeAsync(user2.userId);
    }
  });

  // Test middleware ordering/stacking
  Tinytest.addAsync('accounts-express - createAuthMiddleware - middleware stacking', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      // Test stacked middleware
      const response = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth/stacked'), token);
      test.equal(response.status, 200);

      const data = await response.json();
      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
      test.isTrue(data.isSame);
      test.equal(data.middlewareTest, 'passed');

      // Test prefix-mounted middleware
      const prefixRes = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth/prefix'), token);
      test.equal(prefixRes.status, 200);

      const prefixData = await prefixRes.json();
      test.equal(prefixData.meteorUserId, userId);
      test.equal(prefixData.reqUserId, userId);
      test.isTrue(prefixData.isSame);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test cookie-only authentication (no Bearer header)
  Tinytest.addAsync('accounts-express - createAuthMiddleware - cookie-only authentication', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      // Make request with only cookie, no Authorization header
      const response = await fetchWithCookie(Meteor.absoluteUrl('api/express-test-auth'), token);
      test.equal(response.status, 200);

      const data = await response.json();
      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
      test.isTrue(data.isSame);

      // Also test optional auth route with cookie-only
      const optionalRes = await fetchWithCookie(Meteor.absoluteUrl('api/express-test-auth-optional'), token);
      test.equal(optionalRes.status, 200);

      const optionalData = await optionalRes.json();
      test.equal(optionalData.meteorUserId, userId);
      test.equal(optionalData.reqUserId, userId);
      test.isTrue(optionalData.authenticated);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test concurrency/isolation
  Tinytest.addAsync('accounts-express - createAuthMiddleware - concurrency and isolation', async (test) => {
    const user1 = await createUserWithToken();
    const user2 = await createUserWithToken();

    try {
      // Make concurrent requests with different auth tokens
      const [response1, response2] = await Promise.all([
        fetchWithToken(Meteor.absoluteUrl('api/express-test-auth'), user1.token),
        fetchWithToken(Meteor.absoluteUrl('api/express-test-auth'), user2.token)
      ]);

      const data1 = await response1.json();
      const data2 = await response2.json();

      // Verify each request has the correct user ID
      test.equal(data1.meteorUserId, user1.userId);
      test.equal(data1.reqUserId, user1.userId);
      test.isTrue(data1.isSame);

      test.equal(data2.meteorUserId, user2.userId);
      test.equal(data2.reqUserId, user2.userId);
      test.isTrue(data2.isSame);

      // Verify no cross-request contamination
      test.notEqual(data1.meteorUserId, data2.meteorUserId);
    } finally {
      await Meteor.users.removeAsync(user1.userId);
      await Meteor.users.removeAsync(user2.userId);
    }
  });

  // --- Fetch auth tests for both Meteor.fetch and import { fetch } from 'meteor/fetch' ---

  const { fetch: packageFetch } = require('meteor/fetch');

  const fetchTestCases = [
    { name: 'Meteor.fetch', fetchFn: (...args) => Meteor.fetch(...args) },
    { name: 'meteor/fetch', fetchFn: packageFetch },
  ];

  for (const { name, fetchFn } of fetchTestCases) {
    Tinytest.addAsync(`accounts-express - ${name} - explicit token`, async (test) => {
      const { userId, token } = await createUserWithToken();

      try {
        const response = await fetchFn(Meteor.absoluteUrl('api/express-test-request-echo'), {
          token,
        });
        const data = await response.json();

        test.equal(data.meteorUserId, userId);
        test.equal(data.reqUserId, userId);
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    });

    Tinytest.addAsync(`accounts-express - ${name} - auth false skips token`, async (test) => {
      const { userId, token } = await createUserWithToken();

      try {
        const response = await fetchFn(Meteor.absoluteUrl('api/express-test-request-echo'), {
          token,
          auth: false,
        });
        const data = await response.json();

        test.isNull(data.meteorUserId);
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    });

    Tinytest.addAsync(`accounts-express - ${name} - no auth options uses raw fetch`, async (test) => {
      const response = await fetchFn(Meteor.absoluteUrl('api/express-test-request-echo'));
      const data = await response.json();

      test.isNull(data.meteorUserId);
    });
  }

  // Context token forwarding tests — need dedicated routes per fetch variant
  // to avoid re-registering the same path.

  // Forwarding route for package fetch (Meteor.fetch route already registered above)
  Tinytest.addAsync('accounts-express - fetch auth - setup forwarding routes', async (test) => {
    const { fetch: pkgFetch } = require('meteor/fetch');

    WebApp.handlers.get('/api/express-test-package-fetch-forward',
      createAuthMiddleware({ required: true }),
      async (req, res) => {
        const innerResponse = await pkgFetch(Meteor.absoluteUrl('api/express-test-request-echo'), { auth: true });
        const innerData = await innerResponse.json();

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          outerUserId: Meteor.userId(),
          innerUserId: innerData.meteorUserId,
        }));
      }
    );

    test.isTrue(true, 'Forwarding routes set up');
  });

  const contextForwardingCases = [
    { name: 'Meteor.fetch', path: 'api/express-test-request-forward' },
    { name: 'meteor/fetch', path: 'api/express-test-package-fetch-forward' },
  ];

  for (const { name, path } of contextForwardingCases) {
    Tinytest.addAsync(`accounts-express - ${name} - context token forwarding`, async (test) => {
      const { userId, token } = await createUserWithToken();

      try {
        const response = await fetchWithToken(Meteor.absoluteUrl(path), token);
        test.equal(response.status, 200);

        const data = await response.json();
        test.equal(data.outerUserId, userId);
        test.equal(data.innerUserId, userId);
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    });
  }

  // --- HttpOnly Cookie Roundtrip Integration Tests ---

  // Test full roundtrip: set cookie via endpoint, then authenticate via Meteor.fetch
  Tinytest.addAsync('accounts-express - cookie roundtrip - set cookie then authenticate via Meteor.fetch', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      // Step 1: Set the HttpOnly cookie via the cookie endpoint
      const cookieValue = await setCookieForToken(token);
      test.isTrue(!!cookieValue, 'Set-Cookie header should be present');

      // Step 2: Use Meteor.fetch with the cookie to hit a protected endpoint
      const authRes = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth'), {
        headers: { 'Cookie': cookieValue },
        auth: false, // skip Bearer token — we're testing cookie auth
      });
      test.equal(authRes.status, 200);

      const data = await authRes.json();
      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
      test.isTrue(data.isSame);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test that an expired cookie token is rejected
  Tinytest.addAsync('accounts-express - cookie roundtrip - expired cookie is rejected', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      const cookieValue = await setCookieForToken(token);

      // Expire the token by setting its `when` to a date far in the past
      const hashedToken = Accounts._hashLoginToken(token);
      await Meteor.users.updateAsync(
        { _id: userId, 'services.resume.loginTokens.hashedToken': hashedToken },
        { $set: { 'services.resume.loginTokens.$.when': new Date('2000-01-01') } }
      );

      // Hit the required auth endpoint with the expired cookie
      const authRes = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth'), {
        headers: { 'Cookie': cookieValue },
        auth: false,
      });
      test.equal(authRes.status, 401);

      const data = await authRes.json();
      test.equal(data.error, 'Token expired');
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // --- Cross-origin token guard ---

  // Capture-style helper: run createAuthFetch against a fake originalFetch
  // that records the headers it was called with.
  const buildCapturingFetch = () => {
    const capture = { url: null, headers: null, options: null };
    const fakeOriginal = async (url, options = {}) => {
      capture.url = url;
      capture.options = options;
      capture.headers = options.headers;
      return { ok: true, status: 200 };
    };
    return { wrapped: createAuthFetch(fakeOriginal), capture };
  };

  Tinytest.addAsync('accounts-express - createAuthFetch - same-origin URL gets context token', async (test) => {
    const { wrapped, capture } = buildCapturingFetch();

    await _CurrentEndpointInvocation.withValue(
      { userId: 'u1', loginToken: 'context-tok' },
      () => wrapped(Meteor.absoluteUrl('/api/internal'))
    );

    test.equal(capture.headers.get('Authorization'), 'Bearer context-tok');
  });

  Tinytest.addAsync('accounts-express - createAuthFetch - cross-origin URL does NOT leak context token', async (test) => {
    const { wrapped, capture } = buildCapturingFetch();

    await _CurrentEndpointInvocation.withValue(
      { userId: 'u1', loginToken: 'context-tok' },
      () => wrapped('https://other-origin.example/some/path')
    );

    test.isFalse(capture.headers.has('Authorization'),
      'Authorization header must not be set for cross-origin URLs');
  });

  Tinytest.addAsync('accounts-express - createAuthFetch - explicit token attaches even cross-origin', async (test) => {
    const { wrapped, capture } = buildCapturingFetch();

    await _CurrentEndpointInvocation.withValue(
      { userId: 'u1', loginToken: 'context-tok' },
      () => wrapped('https://other-origin.example/some/path', { token: 'explicit-tok' })
    );

    test.equal(capture.headers.get('Authorization'), 'Bearer explicit-tok',
      'Explicit token opt-in attaches regardless of origin');
  });

  Tinytest.addAsync('accounts-express - createAuthFetch - unparseable URL fails closed', async (test) => {
    const { wrapped, capture } = buildCapturingFetch();

    await _CurrentEndpointInvocation.withValue(
      { userId: 'u1', loginToken: 'context-tok' },
      () => wrapped('not a valid url')
    );

    test.isFalse(capture.headers.has('Authorization'),
      'Unparseable URL must not implicitly receive the context token');
  });

  // --- Middleware error propagation ---

  Tinytest.addAsync('accounts-express - createAuthMiddleware - propagates async errors via next(err)', async (test) => {
    const middleware = createAuthMiddleware({ required: true });

    const originalFindOne = Meteor.users.findOneAsync.bind(Meteor.users);
    Meteor.users.findOneAsync = async () => { throw new Error('synthetic db error'); };

    try {
      let nextErr;
      await middleware(
        { headers: { authorization: 'Bearer some-token' } },
        { status: () => ({ json: () => {} }) },
        (err) => { nextErr = err; }
      );

      test.isTrue(nextErr instanceof Error, 'next() should be called with the error');
      test.equal(nextErr.message, 'synthetic db error');
    } finally {
      Meteor.users.findOneAsync = originalFindOne;
    }
  });

  // --- Optional auth: req.userId === null on every fallback path ---

  Tinytest.addAsync('accounts-express - createAuthMiddleware - optional sets req.userId=null on no token', async (test) => {
    const res = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth-optional'), { auth: false });
    const data = await res.json();
    // reqUserId is JSON-serialized — null serializes as null, undefined is dropped.
    test.isTrue('reqUserId' in data, 'req.userId should be set on the request (not undefined)');
    test.isNull(data.reqUserId, 'req.userId should be null when no token is provided');
  });

  Tinytest.addAsync('accounts-express - createAuthMiddleware - optional sets req.userId=null on invalid token', async (test) => {
    const res = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth-optional'), 'totally-bogus');
    const data = await res.json();
    test.isTrue('reqUserId' in data);
    test.isNull(data.reqUserId, 'req.userId should be null when the token does not resolve to a user');
  });

  Tinytest.addAsync('accounts-express - createAuthMiddleware - optional sets req.userId=null on expired token', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      const hashedToken = Accounts._hashLoginToken(token);
      await Meteor.users.updateAsync(
        { _id: userId, 'services.resume.loginTokens.hashedToken': hashedToken },
        { $set: { 'services.resume.loginTokens.$.when': new Date('2000-01-01') } }
      );

      const res = await fetchWithToken(Meteor.absoluteUrl('api/express-test-auth-optional'), token);
      const data = await res.json();
      test.isTrue('reqUserId' in data);
      test.isNull(data.reqUserId, 'req.userId should be null when the token is expired');
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test that a cleared cookie results in unauthenticated access
  Tinytest.addAsync('accounts-express - cookie roundtrip - cleared cookie results in unauthenticated', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      const cookieValue = await setCookieForToken(token);

      // Clear the cookie via the clear endpoint
      const clearRes = await Meteor.fetch(Meteor.absoluteUrl('_accounts/cookie/clear'), {
        method: 'POST',
        headers: { 'Cookie': cookieValue },
        auth: false,
      });
      test.equal(clearRes.status, 200);

      // Extract the cleared cookie from Set-Cookie header
      const clearedCookie = clearRes.headers.get('set-cookie');
      test.isTrue(!!clearedCookie, 'Clear should return Set-Cookie header');
      const clearedCookieValue = clearedCookie.split(';')[0]; // "meteor_login_token="

      // Hit the optional auth endpoint with the cleared cookie
      const authRes = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-auth-optional'), {
        headers: { 'Cookie': clearedCookieValue },
        auth: false,
      });
      test.equal(authRes.status, 200);

      const data = await authRes.json();
      test.isNull(data.meteorUserId);
      test.isFalse(data.authenticated);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });
}
