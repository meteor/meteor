import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-base";
import {
  createAuthMiddleware,
  createLoginMiddleware,
  createLogoutMiddleware,
} from "meteor/accounts-express";
import { Random } from "meteor/random";
import { WebApp } from "meteor/webapp";
import { DDP } from "meteor/ddp-client";

if (Meteor.isServer) {
  // Helpers
  const createUserWithPassword = async (password) => {
    const username = `test_${Random.id()}`;
    const email = `${username}@example.com`;
    const userId = await Accounts.createUser({ username, email, password });
    return { userId, username, email };
  };

  const fetchWithToken = async (url, token, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return Meteor.fetch(url, { ...options, headers, auth: false });
  };

  const postJson = async (url, body, options = {}) => {
    return Meteor.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(body),
      auth: false,
      ...options,
    });
  };

  // --- Setup test routes ---

  // Register routes independently of the selected Tinytest filter.
  {
    const router = WebApp.express.Router();
    router.use(WebApp.express.json());
    router.use(createLoginMiddleware({ path: "/login" }));
    router.use(createLogoutMiddleware({ path: "/logout" }));
    WebApp.handlers.use("/api/rest-auth", router);

    // Protected endpoint for verifying tokens work
    WebApp.handlers.get(
      "/api/rest-auth/me",
      createAuthMiddleware({ required: true }),
      (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            meteorUserId: Meteor.userId(),
            reqUserId: req.userId,
          }),
        );
      },
    );
  }

  // --- Login tests ---

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - valid email and password",
    async (test) => {
      const password = Random.secret();
      const { userId, email } = await createUserWithPassword(password);

      try {
        for (const identifier of [email, email.toUpperCase()]) {
          const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
            email: identifier,
            password,
          });
          test.equal(res.status, 200, identifier);

          const data = await res.json();
          test.equal(data.id, userId);
          test.isTrue(typeof data.token === "string");
          test.isTrue(!!data.token?.length);
          test.isTrue(!!data.tokenExpires);
        }
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - valid username and password",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);

      try {
        for (const identifier of [username, username.toUpperCase()]) {
          const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
            username: identifier,
            password,
          });
          test.equal(res.status, 200, identifier);

          const data = await res.json();
          test.equal(data.id, userId);
          test.isTrue(typeof data.token === "string");
        }
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync("accounts-express - createLoginMiddleware - wrong password", async (test) => {
    const password = Random.secret();
    const { userId } = await createUserWithPassword(password);

    try {
      const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
        username: (await Meteor.users.findOneAsync(userId)).username,
        password: "wrong-password",
      });
      test.equal(res.status, 401);

      const data = await res.json();
      test.isTrue(data.error.includes("Invalid credentials"));
      const user = await Meteor.users.findOneAsync(userId);
      test.equal(user.services?.resume?.loginTokens || [], []);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync("accounts-express - createLoginMiddleware - nonexistent user", async (test) => {
    const username = `nonexistent_user_${Random.id()}`;
    const attempts = [];
    const failures = [];
    const validation = Accounts.validateLoginAttempt((attempt) => {
      if (attempt.methodArguments[0]?.username === username) attempts.push(attempt);
      return true;
    });
    const failure = Accounts.onLoginFailure((attempt) => {
      if (attempt.methodArguments[0]?.username === username) failures.push(attempt);
    });

    try {
      const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
        username,
        password: "whatever",
      });
      test.equal(res.status, 401);

      const data = await res.json();
      test.equal(data.error, "Invalid credentials");
      test.isUndefined(data.token);
      test.equal(attempts.length, 1);
      test.equal(failures.length, 1);
      for (const attempt of [...attempts, ...failures]) {
        test.equal(attempt.type, "password");
        test.equal(attempt.methodName, "rest-login");
        test.equal(attempt.allowed, false);
        test.equal(attempt.connection, null);
        test.isUndefined(attempt.user);
        test.isTrue(!!attempt.error);
      }
    } finally {
      validation.stop();
      failure.stop();
    }
  });

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - user without a password",
    async (test) => {
      const username = `no_password_${Random.id()}`;
      const userId = await Accounts.createUser({ username });
      try {
        const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password: "not-a-password",
        });
        test.equal(res.status, 401);
        const data = await res.json();
        test.equal(data.error, "Invalid credentials");
        test.isUndefined(data.token);
        const user = await Meteor.users.findOneAsync(userId);
        test.equal(user.services?.resume?.loginTokens || [], []);
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - enforces two-factor authentication",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);
      const secret = "JBSWY3DPEHPK3PXP";
      const previousAmbiguousErrors = Accounts._options.ambiguousErrorMessages;
      try {
        Accounts.config({ ambiguousErrorMessages: false });
        await Meteor.users.updateAsync(userId, {
          $set: { "services.twoFactorAuthentication": { secret, type: "otp" } },
        });
        for (const code of [undefined, "invalid-code"]) {
          const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
            username,
            password,
            code,
          });
          test.equal(res.status, 401, code === undefined ? "missing code" : "invalid code");
          const data = await res.json();
          test.equal(
            data.error,
            code === undefined ? "2FA code must be informed" : "Invalid 2FA code",
          );
          test.isUndefined(data.token);
          const user = await Meteor.users.findOneAsync(userId);
          test.equal(
            user.services?.resume?.loginTokens || [],
            [],
            "rejected login must not insert a token",
          );
        }

        Accounts.config({ ambiguousErrorMessages: true });
        const ambiguousFailure = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
          code: "invalid-code",
        });
        test.equal(ambiguousFailure.status, 401);
        const ambiguousData = await ambiguousFailure.json();
        test.equal(ambiguousData.error, "Something went wrong. Please check your credentials.");
        test.isUndefined(ambiguousData.token);
        const rejectedUser = await Meteor.users.findOneAsync(userId);
        test.equal(rejectedUser.services?.resume?.loginTokens || [], []);

        const { token: code } = Accounts._generate2faToken(secret);
        const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
          code,
        });
        test.equal(res.status, 200);
        const data = await res.json();
        test.equal(data.id, userId);
        const me = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), data.token);
        test.equal(me.status, 200);
        test.equal((await me.json()).meteorUserId, userId);
      } finally {
        if (previousAmbiguousErrors === undefined) delete Accounts._options.ambiguousErrorMessages;
        else Accounts._options.ambiguousErrorMessages = previousAmbiguousErrors;
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - validates password length and code type",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);
      const previousPackages = Meteor.settings.packages;
      try {
        Meteor.settings.packages = {
          ...previousPackages,
          accounts: { ...previousPackages?.accounts, passwordMaxLength: password.length - 1 },
        };
        const tooLong = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        test.equal(tooLong.status, 400, "configured maximum password length is enforced");
        test.equal(await tooLong.json(), { error: "Invalid request" });
        const afterLongPassword = await Meteor.users.findOneAsync(userId);
        test.equal(afterLongPassword.services?.resume?.loginTokens || [], []);

        Meteor.settings.packages.accounts.passwordMaxLength = password.length;
        const malformedCode = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
          code: 123456,
        });
        test.equal(malformedCode.status, 400, "code must be a string even when 2FA is disabled");
        test.equal(await malformedCode.json(), { error: "Invalid request" });
        const afterMalformedCode = await Meteor.users.findOneAsync(userId);
        test.equal(afterMalformedCode.services?.resume?.loginTokens || [], []);

        const accepted = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        test.equal(accepted.status, 200, "a password at the configured limit is accepted");
        test.equal((await accepted.json()).id, userId);
      } finally {
        if (previousPackages === undefined) delete Meteor.settings.packages;
        else Meteor.settings.packages = previousPackages;
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync("accounts-express - createLoginMiddleware - missing password", async (test) => {
    const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
      username: "someuser",
    });
    test.equal(res.status, 400);
  });

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - missing email and username",
    async (test) => {
      const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
        password: "somepassword",
      });
      test.equal(res.status, 400);
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - returned token authenticates",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);

      try {
        // Login to get a token
        const loginRes = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        const { token } = await loginRes.json();

        // Use that token to hit a protected endpoint
        const meRes = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), token);
        test.equal(meRes.status, 200);

        const data = await meRes.json();
        test.equal(data.meteorUserId, userId);
        test.equal(data.reqUserId, userId);
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - token expiry matches config",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);

      try {
        const beforeLogin = Date.now();
        const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
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
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - hooks preserve user projection and current-user context",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);
      const hiddenField = "restHookPrivateField";
      const previousSelector = Accounts._options.defaultFieldSelector;
      const observations = [];
      const observe = (name) => async (attempt) => {
        if (attempt.methodArguments[0]?.username === username) {
          const observation = { name, attempt };
          try {
            observation.userId = Meteor.userId();
            observation.user = await Meteor.userAsync();
          } catch (error) {
            observation.contextError = error.message;
          }
          observations.push(observation);
        }
        return true;
      };
      const stoppers = [
        Accounts.validateLoginAttempt(observe("validate")),
        Accounts.onLogin(observe("login")),
        Accounts.onLoginFailure(observe("failure")),
      ];

      try {
        await Meteor.users.updateAsync(userId, { $set: { [hiddenField]: "private" } });
        Accounts.config({ defaultFieldSelector: { [hiddenField]: 0 } });

        const login = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        test.equal(login.status, 200);
        const failure = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password: "wrong-password",
        });
        test.equal(failure.status, 401);

        test.equal(
          observations.map(({ name }) => name),
          ["validate", "login", "validate", "failure"],
        );
        for (const [index, observation] of observations.entries()) {
          const { name, attempt } = observation;
          test.equal(attempt.type, "password", name);
          test.equal(attempt.methodName, "rest-login", name);
          test.equal(attempt.connection, null, name);
          test.equal(attempt.allowed, index < 2, name);
          test.equal(attempt.user?._id, userId, name);
          test.isUndefined(attempt.user?.[hiddenField], name);
          test.equal(attempt.methodArguments[0].username, username, name);
          test.isUndefined(attempt.methodArguments[0].password, name);
          test.isUndefined(observation.contextError, name);
          test.equal(observation.userId, name === "login" ? userId : null, name);
          if (name === "login") {
            test.equal(observation.user?._id, userId);
            test.isUndefined(observation.user?.[hiddenField]);
          } else {
            test.equal(observation.user, null, name);
          }
        }
      } finally {
        stoppers.forEach((stopper) => stopper.stop());
        if (previousSelector === undefined) delete Accounts._options.defaultFieldSelector;
        else Accounts._options.defaultFieldSelector = previousSelector;
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLoginMiddleware - validateLoginAttempt can reject",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);

      const stop = Accounts.validateLoginAttempt((attempt) => {
        if (attempt.methodName === "rest-login" && attempt.user?._id === userId) {
          throw new Meteor.Error(403, "REST login blocked for test");
        }
        return true;
      });

      try {
        for (const attemptedPassword of [password, "wrong-password"]) {
          const res = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
            username,
            password: attemptedPassword,
          });
          test.equal(res.status, 403, "hook rejection overrides a credential failure too");

          const data = await res.json();
          test.equal(data.error, "REST login blocked for test");
          test.isUndefined(data.token);
          const user = await Meteor.users.findOneAsync(userId);
          test.equal(
            user.services?.resume?.loginTokens || [],
            [],
            "validation must precede token insertion",
          );
        }
      } finally {
        stop.stop();
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  // --- Logout tests ---

  Tinytest.addAsync("accounts-express - createLogoutMiddleware - valid token", async (test) => {
    const password = Random.secret();
    const { userId, username } = await createUserWithPassword(password);

    try {
      // Login first
      const loginRes = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
        username,
        password,
      });
      const { token } = await loginRes.json();

      // Logout
      const logoutRes = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/logout"), token, {
        method: "POST",
      });
      test.equal(logoutRes.status, 200);

      const data = await logoutRes.json();
      test.equal(data.message, "Logged out");

      // Token should no longer work
      const meRes = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), token);
      test.equal(meRes.status, 401);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

  Tinytest.addAsync(
    "accounts-express - createLogoutMiddleware - no auth returns 401",
    async (test) => {
      const res = await Meteor.fetch(Meteor.absoluteUrl("api/rest-auth/logout"), {
        method: "POST",
        auth: false,
      });
      test.equal(res.status, 401);
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLogoutMiddleware - only invalidates specific token",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);

      try {
        // Login twice to get two tokens
        const loginRes1 = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        const { token: token1 } = await loginRes1.json();

        const loginRes2 = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        const { token: token2 } = await loginRes2.json();

        // Logout with token1
        await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/logout"), token1, {
          method: "POST",
        });

        // token1 should be invalid
        const res1 = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), token1);
        test.equal(res1.status, 401);

        // token2 should still work
        const res2 = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), token2);
        test.equal(res2.status, 200);

        const data = await res2.json();
        test.equal(data.meteorUserId, userId);
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - createLogoutMiddleware - fires onLogout hook",
    async (test) => {
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
        const loginRes = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        const { token } = await loginRes.json();

        await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/logout"), token, { method: "POST" });

        test.isTrue(hookCalled, "onLogout hook should have been called");
        test.equal(hookUserId, userId);
      } finally {
        stop.stop();
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  // --- Full lifecycle integration tests ---

  Tinytest.addAsync(
    "accounts-express - integration - login, use token, logout, token rejected",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);

      try {
        // Login
        const loginRes = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        test.equal(loginRes.status, 200);
        const { token } = await loginRes.json();

        // Use token
        const meRes = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), token);
        test.equal(meRes.status, 200);

        // Logout
        const logoutRes = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/logout"), token, {
          method: "POST",
        });
        test.equal(logoutRes.status, 200);

        // Token rejected
        const rejectedRes = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), token);
        test.equal(rejectedRes.status, 401);
      } finally {
        await Meteor.users.removeAsync(userId);
      }
    },
  );

  Tinytest.addAsync(
    "accounts-express - integration - REST logout revokes DDP resume without revoking other tokens",
    async (test) => {
      const password = Random.secret();
      const { userId, username } = await createUserWithPassword(password);
      const connections = [];
      const connect = () => {
        const connection = DDP.connect(Meteor.absoluteUrl());
        connections.push(connection);
        return connection;
      };

      try {
        const loginRes = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        test.equal(loginRes.status, 200);
        const { token } = await loginRes.json();
        const otherLogin = await postJson(Meteor.absoluteUrl("api/rest-auth/login"), {
          username,
          password,
        });
        test.equal(otherLogin.status, 200);
        const { token: otherToken } = await otherLogin.json();

        const connection = connect();
        const resumed = await connection.callAsync("login", { resume: token });
        test.equal(resumed.id, userId);
        test.equal(resumed.token, token);

        const logout = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/logout"), token, {
          method: "POST",
        });
        test.equal(logout.status, 200);
        const rejectedHttp = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), token);
        test.equal(rejectedHttp.status, 401);

        const rejectedConnection = connect();
        await test.throwsAsync(
          () => rejectedConnection.callAsync("login", { resume: token }),
          /logged out by the server/,
        );
        const otherConnection = connect();
        const otherResume = await otherConnection.callAsync("login", { resume: otherToken });
        test.equal(otherResume.id, userId);
        const otherHttp = await fetchWithToken(Meteor.absoluteUrl("api/rest-auth/me"), otherToken);
        test.equal(otherHttp.status, 200);
        test.equal((await otherHttp.json()).meteorUserId, userId);
      } finally {
        connections.forEach((connection) => connection.disconnect());
        await Meteor.users.removeAsync(userId);
      }
    },
  );
}
