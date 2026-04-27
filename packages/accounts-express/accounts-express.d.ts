declare module 'meteor/accounts-express' {
  interface MeteorFetchOptions extends RequestInit {
    /** Set to false to skip the authentication header. Default: true for Meteor.fetch; opt-in for fetch from meteor/fetch. */
    auth?: boolean;
    /** Explicit token to use. Server only — ignored on the client. */
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
      options?: import('meteor/accounts-express').MeteorFetchOptions
    ): Promise<Response>;
  }
}

declare module 'meteor/fetch' {
  /**
   * When accounts-express is loaded, `fetch` from meteor/fetch also supports
   * auth options. When `auth` or `token` are passed, the request is delegated
   * through Meteor.fetch which injects the login token automatically.
   */
  function fetch(
    url: string | Request,
    options?: import('meteor/accounts-express').MeteorFetchOptions
  ): Promise<Response>;
}
