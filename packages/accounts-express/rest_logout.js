import { Accounts, _CurrentEndpointInvocation } from "meteor/accounts-base";
import { clearCookieOnResponse } from "./cookie_helpers.js";
import { createWebAppAuthMiddleware } from "./create_auth_middleware.js";

/**
 * Internal: build the terminal Express route handler for logout.
 * Public consumers should use createLogoutMiddleware below.
 *
 * Must be mounted after auth has populated _CurrentEndpointInvocation
 * (userId + loginToken). Invalidates the current login token, fires
 * onLogout hooks, and clears the cookie when useHttpOnlyCookies is on.
 *
 * REST logouts pass null for the connection parameter in onLogout hook
 * callbacks since there is no persistent DDP connection.
 *
 * Private APIs used (accounts-base):
 *   Accounts._hashLoginToken, Accounts.destroyToken,
 *   Accounts._successfulLogout, Accounts._options
 */
function createLogoutHandler(_options = {}) {
  return async function restLogoutHandler(req, res) {
    const invocation = _CurrentEndpointInvocation.get();
    const userId = invocation?.userId;
    const loginToken = invocation?.loginToken;

    if (!userId || !loginToken) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Destroy the specific token
    const hashedToken = Accounts._hashLoginToken(loginToken);
    await Accounts.destroyToken(userId, hashedToken);

    // Fire onLogout hooks
    await Accounts._successfulLogout(null, userId);

    // Clear cookie if enabled
    if (Accounts._options.useHttpOnlyCookies) {
      clearCookieOnResponse(res, req);
    }

    res.json({ message: "Logged out" });
  };
}

/**
 * @summary Create Express middleware that handles logout on a configurable
 * path. Mounts as a single drop-in middleware via app.use(...).
 *
 * Matches POST <path>, runs the auth check (required), then delegates to
 * the internal logout handler. Any other request is passed through.
 * When auth fails the underlying auth middleware short-circuits with 401.
 *
 * @locus Server
 * @param {Object} [options]
 * @param {string} [options.path="/logout"] - Path to match (exact, query
 *   string ignored). Relative to the router's mount point when mounted
 *   under a sub-router.
 * @returns {Function} Express middleware (req, res, next) => void
 */
export function createLogoutMiddleware({ path = "/logout", ...handlerOptions } = {}) {
  const auth = createWebAppAuthMiddleware({
    required: true,
    hashLoginTokenFn: Accounts._hashLoginToken,
  });
  const handler = createLogoutHandler(handlerOptions);
  return function logoutMiddleware(req, res, next) {
    const reqPath = (req.url || "").split("?")[0];
    if (req.method !== "POST" || reqPath !== path) return next();
    return auth(req, res, (err) => {
      if (err) return next(err);
      if (res.headersSent) return;
      return handler(req, res);
    });
  };
}
