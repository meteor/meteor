import { Accounts, _CurrentEndpointInvocation } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Match } from "meteor/check";
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
 *   Accounts._checkPasswordLogin, Accounts._loginMethod, Accounts._options
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

    const loginOptions = { user: email ? { email } : { username }, password };
    if (code !== undefined) loginOptions.code = code;
    // Preserve the REST hook arguments without exposing the password.
    const methodArguments = [{ email, username }];
    if (code) methodArguments[0].code = code;

    return _CurrentEndpointInvocation.withValue({ userId: null, loginToken: null }, async () => {
      let credentialError;
      let result;
      try {
        result = await Accounts._loginMethod(
          null,
          "rest-login",
          methodArguments,
          "password",
          async () => {
            try {
              const checked = await Accounts._checkPasswordLogin(loginOptions);
              credentialError = checked?.error;
              return checked;
            } catch (error) {
              credentialError = error;
              throw error;
            }
          },
        );
      } catch (error) {
        if (error === credentialError && error instanceof Match.Error) {
          return res.status(400).json({ error: "Invalid request" });
        }
        // Let Express handle unexpected failures instead of turning an
        // internal error into a client-visible credential rejection.
        if (!(error instanceof Meteor.Error)) throw error;

        const isTwoFactorError = ["no-2fa-code", "invalid-2fa-code"].includes(error.error);
        if (error === credentialError && !isTwoFactorError) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const status = error.error === 403 ? 403 : 401;
        return res.status(status).json({
          error: error.reason || error.message || "Login not allowed",
        });
      }

      const { id, token, tokenExpires } = result;
      if (Accounts._options.useHttpOnlyCookies) {
        setCookieOnResponse(res, req, token, tokenExpires);
      }
      return res.json({ id, token, tokenExpires });
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
