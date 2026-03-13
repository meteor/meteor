interface MeteorFetchOptions extends RequestInit {
  /** Set to false to skip the authentication header. Default: true */
  auth?: boolean;
  /** Explicit token to use (server only). If omitted, uses context token. */
  token?: string;
}

interface AuthMiddlewareOptions {
  /** Whether authentication is required (401 for unauthenticated) or optional (null userId). Default: false */
  required?: boolean;
}

declare module 'meteor/meteor' {
  namespace Meteor {
    /**
     * When accounts-express is loaded, Meteor.fetch is extended with
     * authentication support. The login token is automatically included
     * in requests unless `auth: false` is passed.
     */
    function fetch(
      url: string | Request,
      options?: MeteorFetchOptions
    ): Promise<Response>;
  }
}

declare module 'meteor/accounts-express' {
  /**
   * Create Express middleware that authenticates requests using Meteor login tokens.
   * Tokens can be provided via Authorization Bearer header or meteor_login_token cookie.
   */
  function createAuthMiddleware(
    options?: AuthMiddlewareOptions
  ): (req: any, res: any, next: () => void) => Promise<void>;

  /**
   * Create an Express route handler for password-based login.
   * Returns JSON {id, token, tokenExpires}. When useHttpOnlyCookies is
   * enabled, also sets the meteor_login_token HttpOnly cookie.
   *
   * Fires all standard Meteor login hooks (validateLoginAttempt, onLogin,
   * onLoginFailure). REST logins pass null for the connection parameter.
   *
   * Requires accounts-password. Request body: {email|username, password, code?}
   */
  function handleLogin(
    options?: {}
  ): (req: any, res: any) => Promise<void>;

  /**
   * Create an Express route handler for logout.
   * Must be mounted after createAuthMiddleware({ required: true }).
   * Invalidates the current login token and fires onLogout hooks.
   * When useHttpOnlyCookies is enabled, clears the cookie.
   */
  function handleLogout(
    options?: {}
  ): (req: any, res: any) => Promise<void>;
}
