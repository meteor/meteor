/** Service configuration passed to `OAuth1Binding`. */
interface OAuth1Config {
  consumerKey?: string;
  secret?: string;
  [key: string]: unknown;
}

/** The provider endpoints an `OAuth1Binding` talks to. */
interface OAuth1Urls {
  requestToken: string;
  authorize: string;
  accessToken: string;
  authenticate?: string;
}

/** Query parameters returned to the callback after user authorization. */
interface OAuth1Query {
  oauth_token: string;
  oauth_verifier: string;
  [key: string]: unknown;
}

type OAuth1Params = Record<string, unknown>;
type OAuth1Callback = (error: Error | undefined, response?: unknown) => void;

/**
 * A binding to a single OAuth 1.0(a) service, handling the request-token /
 * access-token handshake and signed requests.
 */
export class OAuth1Binding {
  constructor(config: OAuth1Config, urls: OAuth1Urls);

  requestToken?: string;
  requestTokenSecret?: string;
  accessToken?: string;
  accessTokenSecret?: string;

  /** Obtain a request token, storing it on the instance. */
  prepareRequestToken(callbackUrl: string): Promise<void>;
  /** Exchange the authorized request token for an access token. */
  prepareAccessToken(query: OAuth1Query, requestTokenSecret?: string): Promise<void>;

  /** Make a signed request with an explicit HTTP method. */
  callAsync(method: string, url: string, params?: OAuth1Params, callback?: OAuth1Callback): Promise<unknown>;
  /** Make a signed GET request. */
  getAsync(url: string, params?: OAuth1Params, callback?: OAuth1Callback): Promise<unknown>;
  /** Make a signed POST request. */
  postAsync(url: string, params?: OAuth1Params, callback?: OAuth1Callback): Promise<unknown>;
  /** @deprecated Use `getAsync`. */
  get(url: string, params?: OAuth1Params, callback?: OAuth1Callback): unknown;
  /** @deprecated Use `postAsync`. */
  post(url: string, params?: OAuth1Params, callback?: OAuth1Callback): unknown;
}
