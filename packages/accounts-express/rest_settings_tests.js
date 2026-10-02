import { IncomingMessage, ServerResponse } from "http";
import { Duplex } from "stream";
import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { WebApp } from "meteor/webapp";
import { createConfiguredRestMiddleware } from "./rest_settings.js";

// Exercise Express and its JSON parser without opening a listening socket.
function request(middleware, { method = "POST", url, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const output = [];
    const socket = new Duplex({
      read() {},
      write(chunk, encoding, callback) {
        output.push(Buffer.from(chunk));
        callback();
      },
    });
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = { ...headers };
    req.httpVersion = "1.1";
    if (body !== undefined) {
      req.headers["content-type"] = "application/json";
      req.headers["content-length"] = Buffer.byteLength(body).toString();
      req.push(body);
    }
    req.push(null);
    req.complete = true;

    const res = new ServerResponse(req);
    res.assignSocket(socket);
    let forwardedError;
    res.on("error", reject);
    res.on("finish", () => {
      try {
        const raw = Buffer.concat(output).toString();
        resolve({
          status: res.statusCode,
          data: JSON.parse(raw.slice(raw.indexOf("\r\n\r\n") + 4)),
          request: req,
          error: forwardedError,
        });
      } catch (error) {
        reject(error);
      } finally {
        socket.destroy();
      }
    });

    const app = WebApp.express();
    app.use(middleware);
    app.use((req, res) => res.status(404).json({ error: "Not found" }));
    app.use((error, req, res, _next) => {
      forwardedError = error;
      res.status(error.status || 500).json({ error: "Request failed" });
    });
    app(req, res);
  });
}

Tinytest.add("accounts-express - REST settings - disabled without accounts-password", (test) => {
  const previousCheck = Accounts._checkPasswordLogin;
  delete Accounts._checkPasswordLogin;
  try {
    for (const options of [undefined, {}, { enabled: false }, { loginPath: "/auth/login" }]) {
      test.equal(createConfiguredRestMiddleware(options), null);
    }
    test.throws(() => createConfiguredRestMiddleware({ enabled: true }), /accounts-password/);
  } finally {
    Accounts._checkPasswordLogin = previousCheck;
  }
});

Tinytest.add("accounts-express - REST settings - invalid configuration", (test) => {
  for (const options of [
    null,
    true,
    [],
    { enabled: "true" },
    { loginPath: 123 },
    { enable: true },
  ]) {
    test.throws(() => createConfiguredRestMiddleware(options), /Match error/);
  }
  for (const path of ["login", "//login", "/login?next=/", "/login#form", "/log in", "/log\\in"]) {
    test.throws(() => createConfiguredRestMiddleware({ loginPath: path }), /loginPath/);
    test.throws(() => createConfiguredRestMiddleware({ logoutPath: path }), /logoutPath/);
  }
  test.throws(() => createConfiguredRestMiddleware({ loginPath: "/logout" }), /must be different/);
});

Tinytest.addAsync("accounts-express - REST settings - default paths", async (test) => {
  const middleware = createConfiguredRestMiddleware({ enabled: true });
  const login = await request(middleware, { url: "/login", body: "{}" });
  test.equal(login.status, 400);
  test.equal(login.data, { error: "Password is required" });
  const logout = await request(middleware, { url: "/logout" });
  test.equal(logout.status, 401);
  test.equal(logout.data, { error: "Unauthorized" });
});

Tinytest.addAsync(
  "accounts-express - REST settings - JSON parsing stays on the login route",
  async (test) => {
    const middleware = createConfiguredRestMiddleware({
      enabled: true,
      loginPath: "/auth/login",
      logoutPath: "/auth/logout",
    });
    const malformed = "{invalid-json";
    for (const [method, url] of [
      ["POST", "/unrelated"],
      ["POST", "/login"],
      ["POST", "/logout"],
      ["POST", "/auth/login/extra"],
      ["POST", "/auth/login/"],
      ["GET", "/auth/login"],
    ]) {
      const result = await request(middleware, { method, url, body: malformed });
      test.equal(result.status, 404, `${method} ${url}`);
      test.isUndefined(result.request.body);
      test.isUndefined(result.error);
    }

    const logout = await request(middleware, { url: "/auth/logout", body: malformed });
    test.equal(logout.status, 401, "logout does not parse a JSON body");
    test.isUndefined(logout.request.body);
    test.isUndefined(logout.error);

    const login = await request(middleware, { url: "/auth/login?next=/", body: malformed });
    test.equal(login.status, 400);
    test.equal(login.error?.type, "entity.parse.failed");
  },
);

Tinytest.addAsync(
  "accounts-express - REST settings - Express receives unexpected login errors",
  async (test) => {
    const middleware = createConfiguredRestMiddleware({ enabled: true });
    const username = `rest_settings_failure_${Random.id()}`;
    const failure = new Error("synthetic REST login failure");
    const previousLoginMethod = Accounts._loginMethod;
    Accounts._loginMethod = async function (connection, name, args, ...rest) {
      if (name === "rest-login" && args[0]?.username === username) throw failure;
      return previousLoginMethod.call(this, connection, name, args, ...rest);
    };
    try {
      const result = await request(middleware, {
        url: "/login",
        body: JSON.stringify({ username, password: "password" }),
      });
      test.equal(result.status, 500);
      test.isTrue(result.error === failure);
      test.isUndefined(result.data.token);
    } finally {
      Accounts._loginMethod = previousLoginMethod;
    }
  },
);

Tinytest.addAsync(
  "accounts-express - REST settings - custom routes issue and revoke a session",
  async (test) => {
    const middleware = createConfiguredRestMiddleware({
      enabled: true,
      loginPath: "/auth/login",
      logoutPath: "/auth/logout",
    });
    const username = `rest_settings_${Random.id()}`;
    const password = Random.secret();
    const userId = await Accounts.createUser({ username, password });
    try {
      const login = await request(middleware, {
        url: "/auth/login?next=%2Fprofile",
        body: JSON.stringify({ username, password }),
      });
      test.equal(login.status, 200);
      test.equal(login.data.id, userId);
      test.isTrue(typeof login.data.token === "string" && login.data.token.length > 0);
      const hashedToken = Accounts._hashLoginToken(login.data.token);
      const loggedIn = await Meteor.users.findOneAsync(userId);
      test.equal(
        loggedIn.services.resume.loginTokens.map((token) => token.hashedToken),
        [hashedToken],
      );

      const logout = await request(middleware, {
        url: "/auth/logout?next=%2F",
        headers: { authorization: `Bearer ${login.data.token}` },
      });
      test.equal(logout.status, 200);
      test.equal(logout.data, { message: "Logged out" });
      const loggedOut = await Meteor.users.findOneAsync(userId);
      test.equal(loggedOut.services.resume.loginTokens, []);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  },
);
