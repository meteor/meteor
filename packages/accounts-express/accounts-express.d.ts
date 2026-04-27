declare module 'meteor/accounts-express' {
  interface MeteorFetchOptions extends RequestInit {
    /** Set to true to attach the user's login token. Default: false for Meteor.fetch and meteor/fetch; true for fetch from meteor/accounts-express. */
    auth?: boolean;
    /** Explicit token to use. Server only, ignored on the client. Implies auth: true unless auth: false is set explicitly. */
    token?: string;
  }

  interface AuthMiddlewareOptions {
    /** Whether authentication is required (401 for unauthenticated) or optional (null userId). Default: false */
    required?: boolean;
  }

  /**
   * Create Express middleware that authenticates requests using Meteor login tokens.
   * Tokens can be provided via Authorization Bearer header or meteor_login_token cookie.
   */
  function createAuthMiddleware(
    options?: AuthMiddlewareOptions
  ): (req: any, res: any, next: () => void) => Promise<void>;

  /**
   * Auth-on-by-default fetch. Thin wrapper around Meteor.fetch that sets
   * auth: true unless overridden. Pass auth: false to opt out, or token
   * (server only) to provide an explicit token.
   */
  function fetch(
    url: string | Request,
    options?: MeteorFetchOptions
  ): Promise<Response>;
}

declare module 'meteor/meteor' {
  namespace Meteor {
    /**
     * When accounts-express is loaded, Meteor.fetch is wrapped with an
     * auth-aware adapter. Auth is opt-in: pass auth: true (or token on
     * the server) to attach the login token. By default no auth is
     * applied. For an auth-on-by-default ergonomic, import fetch from
     * meteor/accounts-express instead.
     */
    function fetch(
      url: string | Request,
      options?: import('meteor/accounts-express').MeteorFetchOptions
    ): Promise<Response>;
  }
}

declare module 'meteor/fetch' {
  /**
   * When accounts-express is loaded, fetch from meteor/fetch also supports
   * auth options. Auth is opt-in: pass auth: true (or token on the server)
   * to delegate through Meteor.fetch which injects the login token. By
   * default no auth is applied. On the client, token is server-only and
   * is ignored.
   */
  function fetch(
    url: string | Request,
    options?: import('meteor/accounts-express').MeteorFetchOptions
  ): Promise<Response>;
}
