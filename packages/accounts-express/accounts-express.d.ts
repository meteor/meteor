export interface MeteorFetchOptions extends RequestInit {
  /** Set to true to attach the user's login token. Default: false for Meteor.fetch and meteor/fetch; true for fetch from meteor/accounts-express. */
  auth?: boolean;
  /** Explicit token to use. Server only, ignored on the client. Implies auth: true unless auth: false is set explicitly. */
  token?: string;
}

export interface AuthMiddlewareOptions {
  /** Whether authentication is required (401 for unauthenticated) or optional (null userId). Default: false */
  required?: boolean;
  /**
   * Accept API tokens from the Bearer header. Default: false.
   * true accepts unrestricted API tokens only; a nonempty scopes list also
   * accepts tokens granting every listed scope. Session tokens remain valid.
   * Valid API tokens with insufficient scopes return 403 even when required is false.
   */
  apiTokens?: boolean | { scopes: string[] };
}

/** Authentication metadata on req.auth and the current endpoint invocation. */
export type RequestAuth =
  | { type: "session" }
  | { type: "apiToken"; tokenId: string; scopes: string[] | null };

export interface RestEndpointMiddlewareOptions {
  /** Path to match (exact, query string ignored). Default: "/login" or "/logout". */
  path?: string;
}

/** Private Meteor.settings.packages["accounts-express"].rest options, read at startup. */
export interface RestApiSettings {
  /** Mount password login and session logout endpoints. Default: false. Requires accounts-password. */
  enabled?: boolean;
  /** Exact POST path within the application, without the ROOT_URL prefix. Default: "/login". */
  loginPath?: string;
  /** Exact POST path, distinct from loginPath. Default: "/logout". */
  logoutPath?: string;
}

/**
 * Create Express middleware that authenticates requests using Meteor login tokens.
 * Session tokens can be provided via Authorization Bearer header or
 * meteor_login_token cookie. API tokens require explicit opt-in and a Bearer header.
 * Populates req.userId and req.auth (RequestAuth, or null when anonymous).
 */
export function createAuthMiddleware(
  options?: AuthMiddlewareOptions,
): (req: any, res: any, next: () => void) => Promise<void>;

/**
 * Create Express middleware that handles password-based login on a
 * configurable path. Mounts via app.use(...). Matches POST <path> and
 * delegates to the internal login handler; any other request passes
 * through to next().
 *
 * Returns JSON {id, token, tokenExpires}. When useHttpOnlyCookies is
 * enabled, also sets the meteor_login_token HttpOnly cookie. Fires all
 * standard Meteor login hooks (validateLoginAttempt, onLogin,
 * onLoginFailure).
 *
 * Requires accounts-password. Request body: {email|username, password, code?}
 */
export function createLoginMiddleware(
  options?: RestEndpointMiddlewareOptions,
): (req: any, res: any, next: (err?: any) => void) => void;

/**
 * Create Express middleware that handles logout on a configurable path.
 * Mounts via app.use(...). Matches POST <path>, runs the auth check
 * (required), then delegates to the internal logout handler. Any other
 * request passes through to next().
 *
 * Invalidates the current login token and fires onLogout hooks. When
 * useHttpOnlyCookies is enabled, clears the cookie.
 */
export function createLogoutMiddleware(
  options?: RestEndpointMiddlewareOptions,
): (req: any, res: any, next: (err?: any) => void) => void;

/**
 * Auth-on-by-default fetch. Thin wrapper around Meteor.fetch that sets
 * auth: true unless overridden. Pass auth: false to opt out, or token
 * (server only) to provide an explicit token.
 */
export function fetch(url: string | Request, options?: MeteorFetchOptions): Promise<Response>;

/**
 * Wrap a base fetch implementation so that auth and token options are
 * honored. The returned function has the same shape as the input but
 * accepts MeteorFetchOptions.
 */
export function createAuthFetch(
  originalFetch: (url: string | Request, options?: RequestInit) => Promise<Response>,
): (url: string | Request, options?: MeteorFetchOptions) => Promise<Response>;

/**
 * Delegate fetch calls to Meteor.fetch when auth/token options are
 * present; otherwise call through to rawFetch. Used by meteor/fetch
 * to opt into auth handling without taking a hard dependency.
 */
export function handleFetch(
  url: string | Request,
  options?: MeteorFetchOptions,
  rawFetch?: (url: string | Request, options?: RequestInit) => Promise<Response>,
): Promise<Response>;

declare module "meteor/meteor" {
  namespace Meteor {
    /**
     * When accounts-express is loaded, Meteor.fetch is wrapped with an
     * auth-aware adapter. Auth is opt-in: pass auth: true (or token on
     * the server) to attach the login token. For an auth-on-by-default
     * ergonomic, import fetch from meteor/accounts-express instead.
     */
    function fetch(url: string | Request, options?: MeteorFetchOptions): Promise<Response>;
  }
}

declare module "meteor/fetch" {
  /**
   * When accounts-express is loaded, fetch from meteor/fetch also
   * accepts auth options. Auth is opt-in: pass auth: true (or token on
   * the server) to delegate through Meteor.fetch which injects the
   * login token. On the client, token is server-only and ignored.
   */
  export function fetch(url: string | Request, options?: MeteorFetchOptions): Promise<Response>;
}
