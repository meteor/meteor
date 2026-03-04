import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Tinytest } from 'meteor/tinytest';

// Only run these tests on the client
if (Meteor.isClient) {
  // Helper function to create a mock fetch implementation
  const createMockFetch = (expectedHeaders, responseData) => {
    return async (url, options = {}) => {
      // Verify headers match expected headers
      const headers = options.headers || {};
      for (const [key, value] of Object.entries(expectedHeaders)) {
        if (headers.get(key) !== value) {
          throw new Error(`Expected header ${key} to be ${value}, got ${headers.get(key)}`);
        }
      }

      // Return a mock response
      return {
        ok: true,
        status: 200,
        json: async () => responseData,
        text: async () => JSON.stringify(responseData)
      };
    };
  };

  const cleanUp = () => {
    localStorage.removeItem('Meteor.loginToken');
    sessionStorage.removeItem('Meteor.loginToken');
  };

  // Setup test endpoint
  const testEndpoint = '/api/test-client-fetch';
  const testUrl = Meteor.absoluteUrl(testEndpoint);

  // Test that Meteor.fetch adds auth token when logged in
  Tinytest.addAsync('accounts-express - client fetch - adds auth token when logged in', async (test) => {
    // Save original fetch
    const originalFetch = window.fetch;

    try {
      cleanUp();

      // Create a test user and login
      const username = `test-${Random.id()}`;
      const password = 'password';

      await new Promise((resolve, reject) => {
        Accounts.createUser({ username, password }, (error) => {
          if (error) {
            reject(error);
          } else {
            Meteor.loginWithPassword(username, password, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });
      });

      // Use Accounts._storedLoginToken() to get the token correctly
      const token = Accounts._storedLoginToken();
      test.isTrue(!!token, 'Login token should be available via _storedLoginToken()');

      // Set up mock fetch that expects the auth header
      const expectedHeaders = {
        'Authorization': `Bearer ${token}`
      };
      const responseData = { success: true };
      window.fetch = createMockFetch(expectedHeaders, responseData);

      // Call Meteor.fetch
      const response = await Meteor.fetch(testUrl);
      const data = await response.json();

      // Verify response
      test.isTrue(response.ok);
      test.equal(data, responseData);

      // Clean up
      await Meteor.callAsync('removeAccountsTestUser', username);
    } finally {
      window.fetch = originalFetch;
      Meteor.logout();
    }
  });

  // Test that Meteor.fetch works without auth token when not logged in
  Tinytest.addAsync('accounts-express - client fetch - works without auth token when not logged in', async (test) => {
    const originalFetch = window.fetch;

    try {
      cleanUp();
      Meteor.logout();

      // Verify no stored token
      const token = Accounts._storedLoginToken();
      test.isFalse(!!token, 'Login token should not be available');

      // Set up mock fetch that expects no auth header
      const expectedHeaders = {};
      const responseData = { success: true };
      window.fetch = createMockFetch(expectedHeaders, responseData);

      const response = await Meteor.fetch(testUrl);
      const data = await response.json();

      test.isTrue(response.ok);
      test.equal(data, responseData);
    } finally {
      window.fetch = originalFetch;
    }
  });

  // Test that Meteor.fetch preserves other headers and options
  Tinytest.addAsync('accounts-express - client fetch - preserves other headers and options', async (test) => {
    const originalFetch = window.fetch;

    try {
      cleanUp();
      Meteor.logout();

      const customHeaders = {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value'
      };

      const customOptions = {
        method: 'POST',
        body: JSON.stringify({ data: 'test' })
      };

      const expectedHeaders = { ...customHeaders };
      const responseData = { success: true };

      window.fetch = async (url, options = {}) => {
        test.equal(url, testUrl);
        test.equal(options.method, customOptions.method);
        test.equal(options.body, customOptions.body);

        const headers = options.headers;
        for (const [key, value] of Object.entries(expectedHeaders)) {
          test.equal(headers.get(key), value);
        }

        return {
          ok: true,
          status: 200,
          json: async () => responseData,
          text: async () => JSON.stringify(responseData)
        };
      };

      const response = await Meteor.fetch(testUrl, {
        ...customOptions,
        headers: customHeaders
      });

      const data = await response.json();

      test.isTrue(response.ok);
      test.equal(data, responseData);
    } finally {
      window.fetch = originalFetch;
    }
  });

  // Test that auth: false skips token injection even when logged in
  Tinytest.addAsync('accounts-express - client fetch - auth false skips token when logged in', async (test) => {
    const originalFetch = window.fetch;

    try {
      cleanUp();

      const username = `test-${Random.id()}`;
      const password = 'password';

      await new Promise((resolve, reject) => {
        Accounts.createUser({ username, password }, (error) => {
          if (error) {
            reject(error);
          } else {
            Meteor.loginWithPassword(username, password, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });
      });

      // Verify token exists
      const token = Accounts._storedLoginToken();
      test.isTrue(!!token, 'Login token should be available');

      // Set up mock fetch that checks NO auth header is present
      window.fetch = async (url, options = {}) => {
        const headers = options.headers;
        test.isFalse(headers.has('Authorization'), 'Authorization header should not be set when auth: false');

        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
          text: async () => JSON.stringify({ success: true })
        };
      };

      const response = await Meteor.fetch(testUrl, { auth: false });
      test.isTrue(response.ok);

      await Meteor.callAsync('removeAccountsTestUser', username);
    } finally {
      window.fetch = originalFetch;
      Meteor.logout();
    }
  });

  // Test that Meteor.fetch works with session storage when configured
  Tinytest.addAsync('accounts-express - client fetch - works with session storage', async (test) => {
    const originalFetch = window.fetch;
    const originalOptions = Accounts._options;

    try {
      cleanUp();

      // Configure Accounts to use session storage
      Accounts.config({ clientStorage: 'session' });

      const username = `test-${Random.id()}`;
      const password = 'password';

      await new Promise((resolve, reject) => {
        Accounts.createUser({ username, password }, (error) => {
          if (error) {
            reject(error);
          } else {
            Meteor.loginWithPassword(username, password, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });
      });

      // Get the token via the proper API (handles session storage correctly)
      const token = Accounts._storedLoginToken();
      test.isTrue(!!token, 'Login token should be available via _storedLoginToken()');

      // Set up mock fetch that expects the auth header
      const expectedHeaders = {
        'Authorization': `Bearer ${token}`
      };
      const responseData = { success: true };
      window.fetch = createMockFetch(expectedHeaders, responseData);

      const response = await Meteor.fetch(testUrl);
      const data = await response.json();

      test.isTrue(response.ok);
      test.equal(data, responseData);

      await Meteor.callAsync('removeAccountsTestUser', username);
    } finally {
      window.fetch = originalFetch;
      Accounts._options = originalOptions;
      Meteor.logout();
    }
  });
}
