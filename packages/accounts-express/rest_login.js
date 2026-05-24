import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { check } from "meteor/check";
import { setCookieOnResponse } from "./cookie_helpers.js";

/**
 * Internal: build the terminal Express route handler for password login.
 * Public consumers should use createLoginMiddleware below.
 *
 * Returns a JSON response with {id, token, tokenExpires}.
 * When useHttpOnlyCookies is enabled, also sets the meteor_login_token cookie.
 *
 * Fires all standard Meteor login hooks: validateLoginAttempt, onLogin,
 * onLoginFailure. REST logins pass null for the connection parameter in
 * hook callbacks since there is no persistent DDP connection.
 *
 * Private APIs used (accounts-base / accounts-password):
 *   Accounts._checkPasswordAsync, Accounts._generateStampedLoginToken,
 *   Accounts._insertLoginToken, Accounts._tokenExpiration,
 *   Accounts._validateLogin, Accounts._successfulLogin, Accounts._failedLogin,
 *   Accounts._checkPasswordUserFields, Accounts._options
 */
function createLoginHandler(_options = {}) {
  return async function restLoginHandler(req, res) {
    const body = req.body || {};
    const { email, username, password, code } = body;

    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password is required" });
    }
    if (!email && !username) {
      return res.status(400).json({ error: "Email or username is required" });
    }

    // Find user
    let user;
    try {
      if (email) {
        check(email, String);
        user = await Meteor.users.findOneAsync(
          { "emails.address": email },
          { fields: Accounts._checkPasswordUserFields },
        );
      } else {
        check(username, String);
        user = await Meteor.users.findOneAsync(
          { username },
          { fields: Accounts._checkPasswordUserFields },
        );
      }
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const checkResult = await Accounts._checkPasswordAsync(user, password);

    // Build attempt object (mirrors _attemptLogin structure)
    const attempt = {
      type: "password",
      allowed: !!(checkResult.userId && !checkResult.error),
      methodName: "rest-login",
      methodArguments: [{ email, username }],
    };

    const passwordCheckError = checkResult.error;
    if (passwordCheckError) {
      attempt.error = passwordCheckError;
    }

    if (attempt.allowed) {
      // Re-fetch full user for hooks
      attempt.user = await Meteor.users.findOneAsync(checkResult.userId);
    }

    // Include 2FA code in attempt if provided, so validateLoginAttempt
    // hooks (e.g. accounts-2fa) can access it
    if (code) {
      attempt.methodArguments[0].code = code;
    }

    // Run validateLoginAttempt hooks
    // Note: connection is null for REST logins (no persistent DDP connection)
    await Accounts._validateLogin(null, attempt);

    if (!attempt.allowed) {
      await Accounts._failedLogin(null, attempt);

      // Password-check failures map to 401 "Invalid credentials" so we don't
      // leak whether the username or the password was wrong. Only use the
      // error's status code when a validateLoginAttempt hook replaced it.
      if (passwordCheckError && attempt.error === passwordCheckError) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const status = attempt.error?.error === 403 ? 403 : 401;
      return res.status(status).json({
        error: attempt.error?.reason || attempt.error?.message || "Login not allowed",
      });
    }

    // Generate and insert token
    const stampedLoginToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(checkResult.userId, stampedLoginToken);
    const tokenExpires = Accounts._tokenExpiration(stampedLoginToken.when);

    // Fire onLogin hooks
    await Accounts._successfulLogin(null, attempt);

    // Set cookie if enabled
    if (Accounts._options.useHttpOnlyCookies) {
      setCookieOnResponse(res, req, stampedLoginToken.token, tokenExpires);
    }

    res.json({
      id: checkResult.userId,
      token: stampedLoginToken.token,
      tokenExpires,
    });
  };
}

/**
 * @summary Create Express middleware that handles password-based login on a
 * configurable path. Mounts as a single drop-in middleware via app.use(...).
 *
 * Matches POST <path> and delegates to the internal login handler;
 * any other request is passed through to the next middleware.
 *
 * @locus Server
 * @param {Object} [options]
 * @param {string} [options.path="/login"] - Path to match (exact, query
 *   string ignored). The match is performed against req.url, so when the
 *   middleware is mounted under a sub-router this path is relative to the
 *   router's mount point.
 * @returns {Function} Express middleware (req, res, next) => void
 */
export function createLoginMiddleware({ path = "/login", ...handlerOptions } = {}) {
  const handler = createLoginHandler(handlerOptions);
  return function loginMiddleware(req, res, next) {
    const reqPath = (req.url || "").split("?")[0];
    if (req.method !== "POST" || reqPath !== path) return next();
    return handler(req, res);
  };
}
