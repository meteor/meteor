import { Meteor } from 'meteor/meteor';
import { Tinytest } from 'meteor/tinytest';
import { fetchWithAuth } from 'meteor/accounts-base';

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
  const testEndpoint = '/api/test-client-auth';
  const testUrl = Meteor.absoluteUrl(testEndpoint);

  // Test that fetchWithAuth adds auth token to headers when logged in
  Tinytest.addAsync('accounts - client auth - fetchWithAuth adds auth token when logged in', async (test) => {
    // Save original fetch
    const originalFetch = window.fetch;
    
    try {
      // Clean up
      cleanUp();

      // Create a test user and login
      const username = `test-${Random.id()}`;
      const password = 'password';
      
      // Create user and login
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
      
      // Get the token from localStorage
      const token = localStorage.getItem('Meteor.loginToken');
      test.isTrue(!!token, 'Login token should be set in localStorage');
      
      // Set up mock fetch that expects the auth header
      const expectedHeaders = {
        'Authorization': `Bearer ${token}`
      };
      const responseData = { success: true };
      window.fetch = createMockFetch(expectedHeaders, responseData);
      
      // Call fetchWithAuth
      const response = await fetchWithAuth(testUrl);
      const data = await response.json();
      
      // Verify response
      test.isTrue(response.ok);
      test.equal(data, responseData);
      
      // Clean up
      await Meteor.callAsync('removeAccountsTestUser', username);
    } finally {
      // Restore original fetch
      window.fetch = originalFetch;
      // Logout
      Meteor.logout();
    }
  });

  // Test that fetchWithAuth works without auth token when not logged in
  Tinytest.addAsync('accounts - client auth - fetchWithAuth works without auth token when not logged in', async (test) => {
    // Save original fetch
    const originalFetch = window.fetch;
    
    try {
      // Clean up
      cleanUp();

      // Ensure we're logged out
      Meteor.logout();
      
      // Verify no token in localStorage
      const token = localStorage.getItem('Meteor.loginToken');
      test.isFalse(!!token, 'Login token should not be set in localStorage');
      
      // Set up mock fetch that expects no auth header
      const expectedHeaders = {};
      const responseData = { success: true };
      window.fetch = createMockFetch(expectedHeaders, responseData);
      
      // Call fetchWithAuth
      const response = await fetchWithAuth(testUrl);
      const data = await response.json();
      
      // Verify response
      test.isTrue(response.ok);
      test.equal(data, responseData);
    } finally {
      // Restore original fetch
      window.fetch = originalFetch;
    }
  });

  // Test that fetchWithAuth preserves other headers and options
  Tinytest.addAsync('accounts - client auth - fetchWithAuth preserves other headers and options', async (test) => {
    // Save original fetch
    const originalFetch = window.fetch;
    
    try {
      // Clean up
      cleanUp();

      // Ensure we're logged out
      Meteor.logout();
      
      // Set up custom headers and options
      const customHeaders = {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value'
      };
      
      const customOptions = {
        method: 'POST',
        body: JSON.stringify({ data: 'test' })
      };
      
      // Set up mock fetch that expects the custom headers
      const expectedHeaders = { ...customHeaders };
      const responseData = { success: true };
      
      // Create a more sophisticated mock fetch that checks all options
      window.fetch = async (url, options = {}) => {
        // Verify URL
        test.equal(url, testUrl);
        
        // Verify method
        test.equal(options.method, customOptions.method);
        
        // Verify body
        test.equal(options.body, customOptions.body);
        
        // Verify headers
        const headers = options.headers;
        for (const [key, value] of Object.entries(expectedHeaders)) {
          test.equal(headers.get(key), value);
        }
        
        // Return a mock response
        return {
          ok: true,
          status: 200,
          json: async () => responseData,
          text: async () => JSON.stringify(responseData)
        };
      };
      
      // Call fetchWithAuth with custom options
      const response = await fetchWithAuth(testUrl, {
        ...customOptions,
        headers: customHeaders
      });
      
      const data = await response.json();
      
      // Verify response
      test.isTrue(response.ok);
      test.equal(data, responseData);
    } finally {
      // Restore original fetch
      window.fetch = originalFetch;
    }
  });

  // Test that fetchWithAuth works with session storage when configured
  Tinytest.addAsync('accounts - client auth - fetchWithAuth works with session storage when configured', async (test) => {
    // Save original fetch and Accounts options
    const originalFetch = window.fetch;
    const originalOptions = Accounts._options;
    
    try {
      // Clean up
      cleanUp();

      // Configure Accounts to use session storage
      Accounts.config({ clientStorage: 'session' });
      
      // Create a test user and login
      const username = `test-${Random.id()}`;
      const password = 'password';
      
      // Create user and login
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
      
      // Get the token from sessionStorage
      const token = sessionStorage.getItem('Meteor.loginToken');
      test.isTrue(!!token, 'Login token should be set in sessionStorage');
      
      // Set up mock fetch that expects the auth header
      const expectedHeaders = {
        'Authorization': `Bearer ${token}`
      };
      const responseData = { success: true };
      window.fetch = createMockFetch(expectedHeaders, responseData);
      
      // Call fetchWithAuth
      const response = await fetchWithAuth(testUrl);
      const data = await response.json();
      
      // Verify response
      test.isTrue(response.ok);
      test.equal(data, responseData);
      
      // Clean up
      await Meteor.callAsync('removeAccountsTestUser', username);
    } finally {
      // Restore original fetch and options
      window.fetch = originalFetch;
      Accounts._options = originalOptions;
      // Logout
      Meteor.logout();
    }
  });
}
