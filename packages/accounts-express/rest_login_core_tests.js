import { Meteor } from "meteor/meteor";
import { Accounts, _CurrentEndpointInvocation } from "meteor/accounts-base";
import { createLoginMiddleware } from "meteor/accounts-express";
import { Random } from "meteor/random";

Tinytest.addAsync(
  "accounts-express - createLoginMiddleware - concurrent login hooks keep separate identities",
  async (test) => {
    const users = [];
    const password = Random.secret();
    const observations = new Map();
    let releaseHooks;
    const bothHooks = new Promise((resolve) => {
      releaseHooks = resolve;
    });
    let arrivals = 0;
    let timedOut = false;
    let timeout;
    let stopper;

    const snapshot = async () => {
      const userId = Meteor.userId();
      const user = await Meteor.userAsync();
      const invocation = _CurrentEndpointInvocation.get();
      return {
        userId,
        userDocumentId: user?._id,
        endpointUserId: invocation?.userId,
        tokenHash: invocation?.loginToken ? Accounts._hashLoginToken(invocation.loginToken) : null,
      };
    };

    try {
      for (let index = 0; index < 2; index++) {
        const username = `concurrent_rest_${Random.id()}`;
        const userId = await Accounts.createUser({ username, password });
        users.push({ username, userId });
      }
      stopper = Accounts.onLogin(async (attempt) => {
        if (
          attempt.methodName !== "rest-login" ||
          !users.some(({ userId }) => userId === attempt.user?._id)
        )
          return;

        const before = await snapshot();
        if (++arrivals === users.length) {
          clearTimeout(timeout);
          releaseHooks();
        }
        // Both requests must enter their hooks before either can finish.
        await bothHooks;
        observations.set(attempt.user._id, { before, after: await snapshot() });
      });
      timeout = setTimeout(() => {
        timedOut = true;
        releaseHooks();
      }, 10000);

      const responses = await Promise.allSettled(
        users.map(({ username }) =>
          Meteor.fetch(Meteor.absoluteUrl("api/rest-auth/login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
            auth: false,
          }),
        ),
      );

      test.isFalse(timedOut, "both login hooks should reach the barrier");
      test.equal(arrivals, users.length);
      for (const [index, response] of responses.entries()) {
        if (response.status === "rejected") throw response.reason;
        test.equal(response.value.status, 200);
        const data = await response.value.json();
        const { userId } = users[index];
        test.equal(data.id, userId);
        const observation = observations.get(userId);
        test.isTrue(!!observation, "each request should run its login hook");
        if (!observation) continue;
        const expected = {
          userId,
          userDocumentId: userId,
          endpointUserId: userId,
          tokenHash: Accounts._hashLoginToken(data.token),
        };
        test.equal(observation.before, expected, "identity before awaiting the other login");
        test.equal(observation.after, expected, "identity after awaiting the other login");
      }
    } finally {
      clearTimeout(timeout);
      releaseHooks();
      stopper?.stop();
      await Promise.all(users.map(({ userId }) => Meteor.users.removeAsync(userId)));
    }
  },
);

Tinytest.addAsync(
  "accounts-express - createLoginMiddleware - token insertion failures remain server errors",
  async (test) => {
    const username = `failed_rest_insert_${Random.id()}`;
    const password = Random.secret();
    const userId = await Accounts.createUser({ username, password });
    const insertionError = new Error("synthetic token insertion failure");
    const originalInsert = Accounts._insertLoginToken;
    let failedInvocation;
    let loginHookCalled = false;
    let responseWritten = false;
    const stopper = Accounts.onLogin((attempt) => {
      if (attempt.user?._id === userId) loginHookCalled = true;
    });
    const response = {
      status() {
        responseWritten = true;
        return this;
      },
      json() {
        responseWritten = true;
        return this;
      },
      setHeader() {
        responseWritten = true;
      },
    };

    Accounts._insertLoginToken = async function (candidateUserId, ...args) {
      if (candidateUserId === userId) {
        failedInvocation = _CurrentEndpointInvocation.get();
        throw insertionError;
      }
      return originalInsert.call(this, candidateUserId, ...args);
    };
    try {
      const middleware = createLoginMiddleware();
      await test.throwsAsync(
        () =>
          middleware(
            {
              method: "POST",
              url: "/login",
              headers: {},
              body: { username, password },
            },
            response,
            () => {},
          ),
        (error) => error === insertionError,
        "Express must receive the original unexpected failure",
      );
      test.isFalse(
        responseWritten,
        "the login middleware must not return a credential error or cookie",
      );
      test.isFalse(loginHookCalled);
      test.equal(failedInvocation?.userId, null);
      test.equal(failedInvocation?.loginToken, null);
      const user = await Meteor.users.findOneAsync(userId);
      test.equal(user.services?.resume?.loginTokens || [], []);
    } finally {
      Accounts._insertLoginToken = originalInsert;
      stopper.stop();
      await Meteor.users.removeAsync(userId);
    }
  },
);
