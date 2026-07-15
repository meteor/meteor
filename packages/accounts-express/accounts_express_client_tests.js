import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-base";
import { Tinytest } from "meteor/tinytest";

// Only run these tests on the client
if (Meteor.isClient) {
  const { fetch: packageFetch } = require("meteor/fetch");
  const { fetch: aeFetch } = require("meteor/accounts-express");

  const cleanUp = () => {
    localStorage.removeItem("Meteor.loginToken");
    sessionStorage.removeItem("Meteor.loginToken");
  };

  const loginNewUser = async () => {
    cleanUp();
    const username = `test-${Random.id()}`;
    const password = "password";

    await new Promise((resolve, reject) => {
      Accounts.createUser({ username, password }, (error) => {
        if (error) reject(error);
        else {
          Meteor.loginWithPassword(username, password, (err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    });

    return { username, token: Accounts._storedLoginToken() };
  };

  const mockResponse = (data = { success: true }) => ({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });

  const testUrl = Meteor.absoluteUrl("/api/test-client-fetch");

  // --- Shared fetch auth tests for both Meteor.fetch and meteor/fetch ---
  // Both paths (Meteor.fetch and packageFetch with auth options) go through
  // the auth wrapper and ultimately call window.fetch, so mocking works for both.

  const fetchTestCases = [
    { name: "Meteor.fetch", fetchFn: (...args) => Meteor.fetch(...args) },
    { name: "meteor/fetch", fetchFn: packageFetch },
  ];

  for (const { name, fetchFn } of fetchTestCases) {
    Tinytest.addAsync(
      `accounts-express - ${name} - auth true adds token when logged in`,
      async (test) => {
        const originalFetch = window.fetch;

        try {
          const { username, token } = await loginNewUser();
          test.isTrue(!!token, "Login token should be available");

          window.fetch = async (url, options = {}) => {
            const headers = options.headers;
            test.equal(
              headers.get("Authorization"),
              `Bearer ${token}`,
              "Authorization header should be set",
            );
            return mockResponse();
          };

          // Both variants: pass auth: true (or implicit for Meteor.fetch)
          const response = await fetchFn(testUrl, { auth: true });
          test.isTrue(response.ok);

          await Meteor.callAsync("removeAccountsExpressTestUser", username);
        } finally {
          window.fetch = originalFetch;
          Meteor.logout();
        }
      },
    );

    Tinytest.addAsync(
      `accounts-express - ${name} - auth false skips token when logged in`,
      async (test) => {
        const originalFetch = window.fetch;

        try {
          const { username, token } = await loginNewUser();
          test.isTrue(!!token, "Login token should be available");

          window.fetch = async (url, options = {}) => {
            const headers = options.headers;
            test.isFalse(
              headers.has("Authorization"),
              "Authorization header should not be set when auth: false",
            );
            return mockResponse();
          };

          const response = await fetchFn(testUrl, { auth: false });
          test.isTrue(response.ok);

          await Meteor.callAsync("removeAccountsExpressTestUser", username);
        } finally {
          window.fetch = originalFetch;
          Meteor.logout();
        }
      },
    );
  }

  // --- Meteor.fetch-specific tests ---

  // Meteor.fetch without options defaults to auth: false — works without attaching a token.
  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - works without auth options",
    async (test) => {
      const originalFetch = window.fetch;

      try {
        cleanUp();
        Meteor.logout();

        const token = Accounts._storedLoginToken();
        test.isFalse(!!token, "Login token should not be available");

        window.fetch = async () => mockResponse();

        const response = await Meteor.fetch(testUrl);
        test.isTrue(response.ok);
      } finally {
        window.fetch = originalFetch;
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - preserves other headers and options",
    async (test) => {
      const originalFetch = window.fetch;

      try {
        cleanUp();
        Meteor.logout();

        const customHeaders = {
          "Content-Type": "application/json",
          "X-Custom-Header": "custom-value",
        };
        const customOptions = {
          method: "POST",
          body: JSON.stringify({ data: "test" }),
        };

        window.fetch = async (url, options = {}) => {
          test.equal(url, testUrl);
          test.equal(options.method, customOptions.method);
          test.equal(options.body, customOptions.body);

          const headers = options.headers;
          for (const [key, value] of Object.entries(customHeaders)) {
            test.equal(headers.get(key), value);
          }

          return mockResponse();
        };

        const response = await Meteor.fetch(testUrl, {
          ...customOptions,
          headers: customHeaders,
        });
        test.isTrue(response.ok);
      } finally {
        window.fetch = originalFetch;
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - works with session storage",
    async (test) => {
      const originalFetch = window.fetch;
      const originalOptions = Accounts._options;
      const originalStorageLocation = Accounts.storageLocation;

      try {
        cleanUp();
        Accounts.config({ clientStorage: "session" });

        const { username, token } = await loginNewUser();
        test.isTrue(!!token, "Login token should be available via _storedLoginToken()");

        window.fetch = async (url, options = {}) => {
          const headers = options.headers;
          test.equal(headers.get("Authorization"), `Bearer ${token}`);
          return mockResponse();
        };

        const response = await Meteor.fetch(testUrl, { auth: true });
        test.isTrue(response.ok);

        await Meteor.callAsync("removeAccountsExpressTestUser", username);
      } finally {
        window.fetch = originalFetch;
        Accounts._options = originalOptions;
        Accounts.storageLocation = originalStorageLocation;
        Meteor.logout();
      }
    },
  );

  // --- HttpOnly cookie / credentials tests (Meteor.fetch only) ---

  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - sets credentials include when httpOnly cookies enabled",
    async (test) => {
      const originalFetch = window.fetch;
      const originalUseHttpOnlyCookies = Accounts._useHttpOnlyCookies;

      try {
        cleanUp();
        Meteor.logout();
        Accounts._useHttpOnlyCookies = true;

        window.fetch = async (url, options = {}) => {
          test.equal(
            options.credentials,
            "include",
            "credentials should be include when useHttpOnlyCookies is true",
          );
          return mockResponse();
        };

        const response = await Meteor.fetch(testUrl, { auth: true });
        test.isTrue(response.ok);
      } finally {
        window.fetch = originalFetch;
        Accounts._useHttpOnlyCookies = originalUseHttpOnlyCookies;
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - does not set credentials when httpOnly cookies disabled",
    async (test) => {
      const originalFetch = window.fetch;
      const originalUseHttpOnlyCookies = Accounts._useHttpOnlyCookies;

      try {
        cleanUp();
        Meteor.logout();
        Accounts._useHttpOnlyCookies = false;

        window.fetch = async (url, options = {}) => {
          test.isFalse(
            "credentials" in options,
            "credentials should not be set when useHttpOnlyCookies is false",
          );
          return mockResponse();
        };

        const response = await Meteor.fetch(testUrl, { auth: true });
        test.isTrue(response.ok);
      } finally {
        window.fetch = originalFetch;
        Accounts._useHttpOnlyCookies = originalUseHttpOnlyCookies;
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - does not override user-provided credentials",
    async (test) => {
      const originalFetch = window.fetch;
      const originalUseHttpOnlyCookies = Accounts._useHttpOnlyCookies;

      try {
        cleanUp();
        Meteor.logout();
        Accounts._useHttpOnlyCookies = true;

        window.fetch = async (url, options = {}) => {
          test.equal(
            options.credentials,
            "same-origin",
            "user-provided credentials should not be overridden",
          );
          return mockResponse();
        };

        const response = await Meteor.fetch(testUrl, { auth: true, credentials: "same-origin" });
        test.isTrue(response.ok);
      } finally {
        window.fetch = originalFetch;
        Accounts._useHttpOnlyCookies = originalUseHttpOnlyCookies;
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - auth false skips credentials include",
    async (test) => {
      const originalFetch = window.fetch;
      const originalUseHttpOnlyCookies = Accounts._useHttpOnlyCookies;

      try {
        cleanUp();
        Meteor.logout();
        Accounts._useHttpOnlyCookies = true;

        window.fetch = async (url, options = {}) => {
          test.isFalse(
            "credentials" in options,
            "credentials should not be set when auth is false",
          );
          test.isFalse(
            options.headers?.has("Authorization"),
            "Authorization should not be set when auth is false",
          );
          return mockResponse();
        };

        const response = await Meteor.fetch(testUrl, { auth: false });
        test.isTrue(response.ok);
      } finally {
        window.fetch = originalFetch;
        Accounts._useHttpOnlyCookies = originalUseHttpOnlyCookies;
      }
    },
  );

  // --- meteor/fetch-specific test: no auth options bypasses Meteor.fetch ---
  // Cannot mock window.fetch here because rawFetch is bound at module load time,
  // so we hit the real echo endpoint and verify no auth is injected.

  Tinytest.addAsync(
    "accounts-express - meteor/fetch - no auth options uses raw fetch",
    async (test) => {
      try {
        const { username, token } = await loginNewUser();
        test.isTrue(!!token, "Login token should be available");

        // Call packageFetch WITHOUT auth options — goes to rawFetch, no auth injected
        const response = await packageFetch(Meteor.absoluteUrl("api/express-test-request-echo"));
        test.isTrue(response.ok);

        const data = await response.json();
        test.isNull(data.meteorUserId, "No auth should be injected without auth option");

        await Meteor.callAsync("removeAccountsExpressTestUser", username);
      } finally {
        Meteor.logout();
      }
    },
  );

  // --- Authorization header preservation ---

  Tinytest.addAsync(
    "accounts-express - Meteor.fetch - does not clobber caller-supplied Authorization",
    async (test) => {
      const originalFetch = window.fetch;

      try {
        const { username, token } = await loginNewUser();
        test.isTrue(!!token, "Login token should be available");

        window.fetch = async (url, options = {}) => {
          const headers = options.headers;
          test.equal(
            headers.get("Authorization"),
            "Bearer caller-supplied-key",
            "Caller-supplied Authorization must take precedence over the login token",
          );
          return mockResponse();
        };

        const response = await Meteor.fetch(testUrl, {
          auth: true,
          headers: { Authorization: "Bearer caller-supplied-key" },
        });
        test.isTrue(response.ok);

        await Meteor.callAsync("removeAccountsExpressTestUser", username);
      } finally {
        window.fetch = originalFetch;
        Meteor.logout();
      }
    },
  );

  // --- handleFetch: 'auth: undefined' should not route through auth wrapper ---

  Tinytest.addAsync(
    "accounts-express - meteor/fetch - auth: undefined does not inject token",
    async (test) => {
      try {
        const { username, token } = await loginNewUser();
        test.isTrue(!!token, "Login token should be available");

        // packageFetch with auth: undefined should hit rawFetch (no auth injection),
        // even though the user is logged in.
        const response = await packageFetch(Meteor.absoluteUrl("api/express-test-request-echo"), {
          auth: undefined,
        });
        test.isTrue(response.ok);

        const data = await response.json();
        test.isNull(data.meteorUserId, "auth: undefined must not trigger token injection");

        await Meteor.callAsync("removeAccountsExpressTestUser", username);
      } finally {
        Meteor.logout();
      }
    },
  );

  // --- token option is server-only on the client ---

  Tinytest.addAsync(
    "accounts-express - meteor/fetch - token option is ignored on the client (server-only)",
    async (test) => {
      try {
        // packageFetch with only `token` (no `auth`) on the client should NOT
        // route through the auth wrapper — `token` is documented as server-only.
        const response = await packageFetch(Meteor.absoluteUrl("api/express-test-request-echo"), {
          token: "arbitrary-string",
        });
        test.isTrue(response.ok);

        const data = await response.json();
        test.isNull(data.meteorUserId, "Client must not inject the token option");
      } finally {
        Meteor.logout();
      }
    },
  );

  // --- meteor/accounts-express fetch: auth is on by default ---

  Tinytest.addAsync(
    "accounts-express - aeFetch - default attaches token when logged in",
    async (test) => {
      const originalFetch = window.fetch;

      try {
        const { username, token } = await loginNewUser();
        test.isTrue(!!token, "Login token should be available");

        window.fetch = async (url, options = {}) => {
          test.equal(
            options.headers.get("Authorization"),
            `Bearer ${token}`,
            "aeFetch should attach the login token by default",
          );
          return mockResponse();
        };

        const response = await aeFetch(testUrl);
        test.isTrue(response.ok);

        await Meteor.callAsync("removeAccountsExpressTestUser", username);
      } finally {
        window.fetch = originalFetch;
        Meteor.logout();
      }
    },
  );

  Tinytest.addAsync("accounts-express - aeFetch - auth false opts out", async (test) => {
    const originalFetch = window.fetch;

    try {
      const { username, token } = await loginNewUser();
      test.isTrue(!!token, "Login token should be available");

      window.fetch = async (url, options = {}) => {
        test.isFalse(
          options.headers.has("Authorization"),
          "aeFetch with auth: false must not attach the token",
        );
        return mockResponse();
      };

      const response = await aeFetch(testUrl, { auth: false });
      test.isTrue(response.ok);

      await Meteor.callAsync("removeAccountsExpressTestUser", username);
    } finally {
      window.fetch = originalFetch;
      Meteor.logout();
    }
  });
}
