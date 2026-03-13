import { Accounts, _CurrentEndpointInvocation } from 'meteor/accounts-base';
import { clearCookieOnResponse } from './cookie_helpers.js';

/**
 * @summary Create an Express handler for logout.
 * Must be mounted after createAuthMiddleware({ required: true }) so that
 * the request has userId and loginToken available in context.
 *
 * Invalidates the current login token and fires onLogout hooks.
 * When useHttpOnlyCookies is enabled, also clears the meteor_login_token cookie.
 *
 * REST logouts pass null for the connection parameter in onLogout hook
 * callbacks since there is no persistent DDP connection.
 *
 * Private APIs used (accounts-base):
 *   Accounts._hashLoginToken, Accounts.destroyToken,
 *   Accounts._successfulLogout, Accounts._options
 *
 * @locus Server
 * @param {Object} [options]
 * @returns {Function} Express route handler
 */
export function handleLogout(options = {}) {
  return async function restLogoutHandler(req, res) {
    const invocation = _CurrentEndpointInvocation.get();
    const userId = invocation?.userId;
    const loginToken = invocation?.loginToken;

    if (!userId || !loginToken) {
      return res.status(401).json({ error: 'Not authenticated' });
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

    res.json({ message: 'Logged out' });
  };
}
