import { Accounts } from 'meteor/accounts-base';

interface RequestOptions extends RequestInit {
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
     * Make an authenticated HTTP request.
     * On the client, automatically includes the login token.
     * On the server, uses explicit token or current endpoint context token.
     */
    function fetch(
      url: string | Request,
      options?: RequestOptions
    ): Promise<Response>;
  }
}

declare module 'meteor/accounts-base' {
  namespace Accounts {
    /**
     * Create Express middleware that authenticates requests using Meteor login tokens.
     * Tokens can be provided via Authorization Bearer header or meteor_login_token cookie.
     */
    function createAuthMiddleware(
      options?: AuthMiddlewareOptions
    ): (req: any, res: any, next: () => void) => Promise<void>;
  }
}
