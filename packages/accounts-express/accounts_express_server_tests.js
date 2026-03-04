import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import { WebApp } from 'meteor/webapp';
import { HTTP } from 'meteor/http';

// Tests for Express middleware authentication
if (Meteor.isServer) {
  // Helper function to make HTTP requests with auth token
  const makeAuthRequest = async (url, token, options = {}) => {
    const headers = options.headers || {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return new Promise((resolve, reject) => {
      HTTP.get(url, { ...options, headers }, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  };

  // Helper function to create a test user with a login token
  const createUserWithToken = async () => {
    const username = Random.id();
    const userId = await Accounts.createUser({ username });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);
    return { userId, username, token: stampedToken.token };
  };

  // Helper function to make HTTP requests with cookie token
  const makeRequestWithCookie = async (url, token, options = {}) => {
    const headers = options.headers || {};
    const cookies = options.cookies || {};

    if (token) {
      cookies['meteor_login_token'] = token;
    }

    // Convert cookies object to cookie header string
    if (Object.keys(cookies).length > 0) {
      headers['Cookie'] = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    }

    return new Promise((resolve, reject) => {
      HTTP.get(url, { ...options, headers }, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  };

  // Setup test routes
  Tinytest.addAsync('accounts-express - createAuthMiddleware - setup test routes', async (test) => {
    // Route with auth middleware that returns 401 for unauthenticated requests
    WebApp.handlers.use('/api/express-test-auth', Accounts.createAuthMiddleware({ required: true }));

    // Create a separate router for the optional authentication route
    const optionalAuthRouter = WebApp.express.Router();

    // Apply optional authentication middleware to the router
    optionalAuthRouter.use(Accounts.createAuthMiddleware({ required: false }));

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
      Accounts.createAuthMiddleware({ required: true }),
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
    prefixRouter.use(Accounts.createAuthMiddleware({ required: true }));
    prefixRouter.get('/', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        meteorUserId: Meteor.userId(),
        reqUserId: req.userId,
        isSame: Meteor.userId() === req.userId
      }));
    });
    WebApp.handlers.use('/api/express-test-auth/prefix', prefixRouter);

    test.isTrue(true, 'Test routes set up successfully');
  });

  // Test unauthenticated requests
  Tinytest.addAsync('accounts-express - createAuthMiddleware - unauthenticated requests', async (test) => {
    try {
      // Make request without auth token to required auth route
      await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth'));
      test.fail('Should have thrown an error for unauthorized request');
    } catch (error) {
      // Expect 401 Unauthorized
      test.equal(error.response.statusCode, 401);
      test.isTrue(error.response.content.includes('Unauthorized'));
    }

    // Test optional authentication route with no auth
    const optionalResponse = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth-optional'));
    const optionalData = JSON.parse(optionalResponse.content);

    // Verify unauthenticated state
    test.isNull(optionalData.meteorUserId);
    test.isFalse(optionalData.authenticated);

    // Verify response status for optional auth
    test.equal(optionalResponse.statusCode, 200);
  });

  // Test valid authentication
  Tinytest.addAsync('accounts-express - createAuthMiddleware - valid authentication', async (test) => {
    // Create a test user with a login token
    const { userId, token } = await createUserWithToken();

    try {
      // Make request with valid auth token to required auth route
      const response = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth'), token);

      // Parse response
      const data = JSON.parse(response.content);

      // Verify user IDs match
      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
      test.isTrue(data.isSame);

      // Verify response status
      test.equal(response.statusCode, 200);

      // Test optional authentication route with valid auth
      const optionalResponse = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth-optional'), token);
      const optionalData = JSON.parse(optionalResponse.content);

      // Verify authenticated state
      test.equal(optionalData.meteorUserId, userId);
      test.equal(optionalData.reqUserId, userId);
      test.isTrue(optionalData.authenticated);

      // Verify response status for optional auth
      test.equal(optionalResponse.statusCode, 200);
    } finally {
      // Clean up
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test invalid/malformed authentication
  Tinytest.addAsync('accounts-express - createAuthMiddleware - invalid authentication', async (test) => {
    // Test with invalid token on required auth route
    try {
      await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth'), 'invalid-token');
      test.fail('Should have thrown an error for invalid token');
    } catch (error) {
      // Expect 401 Unauthorized
      test.equal(error.response.statusCode, 401);
      test.isTrue(error.response.content.includes('Invalid token'));
    }

    // Test with malformed token (wrong format) on required auth route
    try {
      await makeAuthRequest(
        Meteor.absoluteUrl('api/express-test-auth'),
        null,
        { headers: { 'Authorization': 'NotBearer token' } }
      );
      test.fail('Should have thrown an error for malformed token');
    } catch (error) {
      // Expect 401 Unauthorized
      test.equal(error.response.statusCode, 401);
      test.isTrue(error.response.content.includes('Unauthorized'));
    }

    // Test with token for nonexistent user on required auth route
    const { userId, token } = await createUserWithToken();
    await Meteor.users.removeAsync(userId); // Remove the user but keep the token

    try {
      await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth'), token);
      test.fail('Should have thrown an error for nonexistent user');
    } catch (error) {
      // Expect 401 Unauthorized
      test.equal(error.response.statusCode, 401);
      test.isTrue(error.response.content.includes('Invalid token'));
    }

    // Test with invalid token on optional auth route
    const invalidTokenResponse = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth-optional'), 'invalid-token');
    const invalidTokenData = JSON.parse(invalidTokenResponse.content);

    // Verify unauthenticated state with invalid token
    test.isNull(invalidTokenData.meteorUserId);
    test.isFalse(invalidTokenData.authenticated);
    test.equal(invalidTokenResponse.statusCode, 200);

    // Test with malformed token on optional auth route
    const malformedTokenResponse = await makeAuthRequest(
      Meteor.absoluteUrl('api/express-test-auth-optional'),
      null,
      { headers: { 'Authorization': 'NotBearer token' } }
    );
    const malformedTokenData = JSON.parse(malformedTokenResponse.content);

    // Verify unauthenticated state with malformed token
    test.isNull(malformedTokenData.meteorUserId);
    test.isFalse(malformedTokenData.authenticated);
    test.equal(malformedTokenResponse.statusCode, 200);

    // Test with token for nonexistent user on optional auth route
    const nonexistentUserResponse = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth-optional'), token);
    const nonexistentUserData = JSON.parse(nonexistentUserResponse.content);

    // Verify unauthenticated state with nonexistent user token
    test.isNull(nonexistentUserData.meteorUserId);
    test.isFalse(nonexistentUserData.authenticated);
    test.equal(nonexistentUserResponse.statusCode, 200);
  });

  // Test token/session mismatch
  Tinytest.addAsync('accounts-express - createAuthMiddleware - token/session mismatch', async (test) => {
    // Create two test users with login tokens
    const user1 = await createUserWithToken();
    const user2 = await createUserWithToken();

    try {
      // Test with conflicting credentials (header token from user1, cookie token from user2)
      // The implementation should prioritize one over the other consistently
      const response = await makeAuthRequest(
        Meteor.absoluteUrl('api/express-test-auth'),
        user1.token,
        { cookies: { 'meteor_login_token': user2.token } }
      );

      // Parse response
      const data = JSON.parse(response.content);

      // Verify that one user ID is consistently used (header takes precedence)
      test.equal(data.meteorUserId, user1.userId);
      test.equal(data.reqUserId, user1.userId);
      test.isTrue(data.isSame);

      // Verify that cookie-only auth works
      const cookieResponse = await makeRequestWithCookie(
        Meteor.absoluteUrl('api/express-test-auth'),
        user2.token
      );

      // Parse response
      const cookieData = JSON.parse(cookieResponse.content);

      // Verify user IDs match
      test.equal(cookieData.meteorUserId, user2.userId);
      test.equal(cookieData.reqUserId, user2.userId);
      test.isTrue(cookieData.isSame);
    } finally {
      // Clean up
      await Meteor.users.removeAsync(user1.userId);
      await Meteor.users.removeAsync(user2.userId);
    }
  });

  // Test middleware ordering/stacking
  Tinytest.addAsync('accounts-express - createAuthMiddleware - middleware stacking', async (test) => {
    // Create a test user with a login token
    const { userId, token } = await createUserWithToken();

    try {
      // Test stacked middleware
      const response = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth/stacked'), token);

      // Parse response
      const data = JSON.parse(response.content);

      // Verify user IDs match
      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
      test.isTrue(data.isSame);

      // Verify middleware executed in correct order
      test.equal(data.middlewareTest, 'passed');

      // Test prefix-mounted middleware
      const prefixResponse = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth/prefix'), token);

      // Parse response
      const prefixData = JSON.parse(prefixResponse.content);

      // Verify user IDs match
      test.equal(prefixData.meteorUserId, userId);
      test.equal(prefixData.reqUserId, userId);
      test.isTrue(prefixData.isSame);
    } finally {
      // Clean up
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test concurrency/isolation
  Tinytest.addAsync('accounts-express - createAuthMiddleware - concurrency and isolation', async (test) => {
    // Create two test users with login tokens
    const user1 = await createUserWithToken();
    const user2 = await createUserWithToken();

    try {
      // Make concurrent requests with different auth tokens
      const [response1, response2] = await Promise.all([
        makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth'), user1.token),
        makeAuthRequest(Meteor.absoluteUrl('api/express-test-auth'), user2.token)
      ]);

      // Parse responses
      const data1 = JSON.parse(response1.content);
      const data2 = JSON.parse(response2.content);

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
      // Clean up
      await Meteor.users.removeAsync(user1.userId);
      await Meteor.users.removeAsync(user2.userId);
    }
  });

  // Test server-side Meteor.fetch() with explicit token
  Tinytest.addAsync('accounts-express - server fetch - explicit token', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      // Set up a test route that echoes back auth info
      WebApp.handlers.get('/api/express-test-request-echo', Accounts.createAuthMiddleware({ required: false }), (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          meteorUserId: Meteor.userId(),
          reqUserId: req.userId,
        }));
      });

      // Use Meteor.fetch with explicit token
      const response = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-request-echo'), {
        token,
      });
      const data = await response.json();

      test.equal(data.meteorUserId, userId);
      test.equal(data.reqUserId, userId);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test server-side Meteor.fetch() with auth: false
  Tinytest.addAsync('accounts-express - server fetch - auth false skips token', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      // Use Meteor.fetch with auth: false -- should not send token
      const response = await Meteor.fetch(Meteor.absoluteUrl('api/express-test-request-echo'), {
        token,
        auth: false,
      });
      const data = await response.json();

      // Should be unauthenticated since auth: false
      test.isNull(data.meteorUserId);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  // Test server-side Meteor.fetch() auto-reads token from endpoint context
  Tinytest.addAsync('accounts-express - server fetch - context token forwarding', async (test) => {
    const { userId, token } = await createUserWithToken();

    try {
      // Set up a route that makes a server-to-server request using context token
      WebApp.handlers.get('/api/express-test-request-forward',
        Accounts.createAuthMiddleware({ required: true }),
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

      // Make request to the forwarding route
      const response = await makeAuthRequest(Meteor.absoluteUrl('api/express-test-request-forward'), token);
      const data = JSON.parse(response.content);

      test.equal(data.outerUserId, userId);
      test.equal(data.innerUserId, userId);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });
}
