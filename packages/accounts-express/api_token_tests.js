import { Meteor } from "meteor/meteor";
import { Accounts, _CurrentEndpointInvocation } from "meteor/accounts-base";
import { createAuthMiddleware, createLogoutMiddleware } from "meteor/accounts-express";
import { DDP } from "meteor/ddp-client";
import { Random } from "meteor/random";
import { WebApp } from "meteor/webapp";

const BASE_PATH = "api/express-api-tokens";
const router = WebApp.express.Router();

const identity = async (req, res) => {
  res.json({
    userId: req.userId,
    meteorUserId: Meteor.userId(),
    userAsyncId: (await Meteor.userAsync())?._id ?? null,
    auth: req.auth,
    contextAuth: _CurrentEndpointInvocation.get().auth,
  });
};

for (const [path, options] of Object.entries({
  default: { required: true },
  unrestricted: { required: true, apiTokens: true },
  read: { required: true, apiTokens: { scopes: ["read"] } },
  write: { required: true, apiTokens: { scopes: ["write"] } },
  "read-write": { required: true, apiTokens: { scopes: ["read", "write"] } },
  optional: { apiTokens: true },
  "read-optional": { apiTokens: { scopes: ["read"] } },
})) {
  router.get(`/${path}`, createAuthMiddleware(options), identity);
}

router.get(
  "/forward",
  createAuthMiddleware({ required: true, apiTokens: { scopes: ["read"] } }),
  async (req, res) => {
    const destinations = {};
    for (const path of ["read", "write", "default"]) {
      const response = await Meteor.fetch(Meteor.absoluteUrl(`${BASE_PATH}/${path}`), {
        auth: true,
      });
      destinations[path] = { status: response.status, body: await response.json() };
    }
    res.json({ auth: req.auth, contextAuth: _CurrentEndpointInvocation.get().auth, destinations });
  },
);
router.use(createLogoutMiddleware());
WebApp.handlers.use(`/${BASE_PATH}`, router);

const request = (path, token, options = {}) =>
  Meteor.fetch(Meteor.absoluteUrl(`${BASE_PATH}/${path}`), {
    ...options,
    auth: false,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });

const createToken = (userId, options = {}) =>
  Accounts.createApiTokenAsync(userId, {
    name: "HTTP integration",
    expiresAt: null,
    ...options,
  });

const createSession = async (userId, when = new Date()) => {
  const stamped = { ...Accounts._generateStampedLoginToken(), when };
  await Accounts._insertLoginToken(userId, stamped);
  return stamped.token;
};

const addTest = (name, run) =>
  Tinytest.addAsync(`accounts-express - API tokens - ${name}`, async (test) => {
    const userId = await Accounts.createUser({ username: `api_token_${Random.id()}` });
    try {
      await run(test, userId);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  });

const expectedIdentity = (userId, auth) => ({
  userId,
  meteorUserId: userId,
  userAsyncId: userId,
  auth,
  contextAuth: auth,
});

Tinytest.add("accounts-express - API tokens - route scope configuration is explicit", (test) => {
  for (const apiTokens of [null, {}, { scopes: [] }, { scopes: [""] }, { scopes: [42] }, "true"]) {
    test.throws(() => createAuthMiddleware({ apiTokens }), /nonempty scopes array/);
  }
});

addTest(
  "unrestricted credentials require route opt-in and expose safe metadata",
  async (test, userId) => {
    const { token, id } = await createToken(userId);
    const optedOut = await request("default", token);
    test.equal(optedOut.status, 401);

    const auth = { type: "apiToken", tokenId: id, scopes: null };
    for (const path of ["unrestricted", "read-write"]) {
      const response = await request(path, token);
      test.equal(response.status, 200, path);
      test.equal(await response.json(), expectedIdentity(userId, auth));
    }

    const anonymous = await request("optional");
    test.equal(anonymous.status, 200);
    test.equal(await anonymous.json(), expectedIdentity(null, null));
  },
);

addTest(
  "scoped credentials require every declared scope and cannot fall through anonymously",
  async (test, userId) => {
    const read = await createToken(userId, { scopes: ["read"] });
    const allowed = await request("read", read.token);
    test.equal(allowed.status, 200);
    test.equal(
      await allowed.json(),
      expectedIdentity(userId, {
        type: "apiToken",
        tokenId: read.id,
        scopes: ["read"],
      }),
    );

    for (const path of ["unrestricted", "optional", "write", "read-write"]) {
      const response = await request(path, read.token);
      test.equal(response.status, 403, path);
      test.isUndefined((await response.json()).userId, "protected handler must not run");
    }
    const write = await createToken(userId, { scopes: ["write"] });
    test.equal((await request("read-optional", write.token)).status, 403);

    const both = await createToken(userId, { scopes: ["read", "write"] });
    const allScopes = await request("read-write", both.token);
    test.equal(allScopes.status, 200);
    test.equal((await allScopes.json()).userId, userId);

    const noScopes = await createToken(userId, { scopes: [] });
    test.equal((await request("read-optional", noScopes.token)).status, 403);
  },
);

addTest(
  "API credentials cannot become cookies or DDP sessions or use session logout",
  async (test, userId) => {
    const { token } = await createToken(userId);
    const cookieRequest = await request("unrestricted", undefined, {
      headers: { Cookie: `meteor_login_token=${token}` },
    });
    test.equal(cookieRequest.status, 401);

    const setCookie = await Meteor.fetch(Meteor.absoluteUrl("_accounts/cookie/set"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: new URL(Meteor.absoluteUrl()).origin },
      body: JSON.stringify({ token }),
      auth: false,
    });
    test.equal(setCookie.status, 401);
    test.isNull(setCookie.headers.get("set-cookie"));

    const connection = DDP.connect(Meteor.absoluteUrl());
    try {
      await test.throwsAsync(
        () => connection.callAsync("login", { resume: token }),
        /logged out by the server/,
      );
    } finally {
      connection.disconnect();
    }

    const logout = await request("logout", token, { method: "POST" });
    test.equal(logout.status, 401);
    test.equal(
      (await request("unrestricted", token)).status,
      200,
      "session logout must not revoke an API token",
    );
  },
);

addTest(
  "expiry and revocation reject credentials without invalidating other tokens",
  async (test, userId) => {
    const expired = await createToken(userId, { expiresAt: new Date(Date.now() + 60_000) });
    const revoked = await createToken(userId);
    const surviving = await createToken(userId);
    test.equal((await request("unrestricted", expired.token)).status, 200);

    await Meteor.users.updateAsync(
      { _id: userId, "services.apiTokens.id": expired.id },
      {
        $set: { "services.apiTokens.$.expiresAt": new Date(Date.now() - 1) },
      },
    );
    await Accounts.revokeApiTokenAsync(userId, revoked.id);
    for (const token of [expired.token, revoked.token]) {
      test.equal((await request("unrestricted", token)).status, 401);
      const optional = await request("optional", token);
      test.equal(optional.status, 200);
      test.equal(await optional.json(), expectedIdentity(null, null));
    }
    test.equal((await request("unrestricted", surviving.token)).status, 200);
  },
);

addTest(
  "sessions retain full access, cookie authentication and independent revocation",
  async (test, userId) => {
    const session = await createSession(userId);
    const apiToken = await createToken(userId, { scopes: ["read"] });
    const auth = { type: "session" };
    for (const options of [{}, { headers: { Cookie: `meteor_login_token=${session}` } }]) {
      const token = options.headers ? undefined : session;
      const response = await request("read-write", token, options);
      test.equal(response.status, 200);
      test.equal(await response.json(), expectedIdentity(userId, auth));
    }

    await Accounts.revokeAllApiTokensAsync(userId);
    test.equal((await request("read", apiToken.token)).status, 401);
    test.equal((await request("default", session)).status, 200);

    const otherApiToken = await createToken(userId);
    const logout = await request("logout", session, { method: "POST" });
    test.equal(logout.status, 200);
    test.equal((await request("default", session)).status, 401);
    test.equal((await request("unrestricted", otherApiToken.token)).status, 200);
  },
);

addTest(
  "password replacement and removing other sessions preserve API credentials",
  async (test, userId) => {
    await Accounts.setPasswordAsync(userId, Random.secret());
    const apiToken = await createToken(userId);
    const currentSession = await createSession(userId);
    const otherSession = await createSession(userId);
    const connection = DDP.connect(Meteor.absoluteUrl());
    try {
      await connection.callAsync("login", { resume: currentSession });
      await connection.callAsync("removeOtherTokens");
      test.equal((await request("default", currentSession)).status, 200);
      test.equal((await request("default", otherSession)).status, 401);
      test.equal((await request("unrestricted", apiToken.token)).status, 200);

      await Accounts.setPasswordAsync(userId, Random.secret(), { logout: true });
      test.equal((await request("default", currentSession)).status, 401);
      test.equal((await request("unrestricted", apiToken.token)).status, 200);
    } finally {
      connection.disconnect();
    }
  },
);

addTest("session timestamps use the Accounts expiration policy", async (test, userId) => {
  const previousLifetime = Accounts._options.loginExpirationInDays;
  try {
    // The long session lifetime would make a malformed null/false timestamp
    // valid if Date coercion silently changed it to the Unix epoch.
    Accounts.config({ loginExpirationInDays: null });
    for (const when of [Date.now(), new Date()]) {
      const token = await createSession(userId, when);
      const valid = await request("default", token);
      test.equal(valid.status, 200, "Date and legacy numeric timestamps remain valid");
      test.equal((await valid.json()).userId, userId);
    }

    const expired = await createSession(userId, Date.now() - Accounts._getTokenLifetimeMs() - 1);
    test.equal((await request("default", expired)).status, 401);

    const malformed = await createSession(userId);
    const selector = {
      _id: userId,
      "services.resume.loginTokens.hashedToken": Accounts._hashLoginToken(malformed),
    };
    for (const when of [null, false, undefined, "1970-01-01T00:00:00.000Z", NaN]) {
      await Meteor.users.updateAsync(
        selector,
        when === undefined
          ? { $unset: { "services.resume.loginTokens.$.when": 1 } }
          : { $set: { "services.resume.loginTokens.$.when": when } },
      );
      test.equal((await request("default", malformed)).status, 401, `reject ${String(when)}`);
    }
  } finally {
    if (previousLifetime === undefined) delete Accounts._options.loginExpirationInDays;
    else Accounts._options.loginExpirationInDays = previousLifetime;
  }
});

addTest(
  "authenticated server fetch preserves credential scopes at each destination",
  async (test, userId) => {
    const { token, id } = await createToken(userId, { scopes: ["read"] });
    const response = await request("forward", token);
    test.equal(response.status, 200);
    const data = await response.json();
    const auth = { type: "apiToken", tokenId: id, scopes: ["read"] };
    test.equal(data.auth, auth);
    test.equal(data.contextAuth, auth);
    test.equal(data.destinations.read, { status: 200, body: expectedIdentity(userId, auth) });
    test.equal(data.destinations.write.status, 403, "forwarding must not grant another scope");
    test.equal(
      data.destinations.default.status,
      401,
      "forwarding must not turn an API token into a session",
    );
  },
);
