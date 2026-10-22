import type { OAuth } from "meteor/oauth";

export namespace OAuth1 {
  type OAuth1URL = string | ((oauth1Binding: OAuth1Binding) => string);

  interface OAuth1URLs {
    requestToken: OAuth1URL;
    authorize: OAuth1URL;
    accessToken: OAuth1URL;
    authenticate?:
      | string
      | ((
          oauth1Binding: OAuth1Binding,
          params: { query: Record<string, unknown> }
        ) => string);
  }

  interface CallResponse {
    content: string;
    data: any;
    headers: Record<string, string>;
    redirected: boolean;
    ok: boolean;
    statusCode: number;
  }

  class OAuth1Binding {
    constructor(
      config: {
        consumerKey: string;
        secret: OAuth.Sealed<string>;
      },
      urls: OAuth1URLs
    );

    prepareRequestToken(callbackUrl: string): Promise<void>;

    accessToken: string | undefined;
    accessTokenSecret: string | undefined;

    callAsync(
      method: string,
      url: string | ((oauthBinding: OAuth1Binding) => string),
      params: Record<string, unknown>
    ): Promise<CallResponse>;
    callAsync(
      method: string,
      url: string | ((oauthBinding: OAuth1Binding) => string),
      params: Record<string, unknown>,
      callback: (err: Error | null, response?: CallResponse) => void
    ): Promise<void>;

    getAsync(
      url: string | ((oauthBinding: OAuth1Binding) => string),
      params: Record<string, unknown>
    ): Promise<CallResponse>;
    getAsync(
      url: string | ((oauthBinding: OAuth1Binding) => string),
      params: Record<string, unknown>,
      callback: (err: Error | null, response?: CallResponse) => void
    ): Promise<void>;

    postAsync(
      url: string | ((oauthBinding: OAuth1Binding) => string),
      params: Record<string, unknown>
    ): Promise<CallResponse>;
    postAsync(
      url: string | ((oauthBinding: OAuth1Binding) => string),
      params: Record<string, unknown>,
      callback: (err: Error | null, response?: CallResponse) => void
    ): Promise<void>;
  }
}

// The OAuth1 package augments the main oauth module
declare module "meteor/oauth" {
  namespace OAuth {
    interface OAuthVersions {
      [1]: {
        urls: OAuth1.OAuth1URLs;
        query: OAuth1.OAuth1Binding;
      };
    }
  }
}
