/** Options accepted by `Twitter.requestCredential`. */
interface RequestCredentialOptions {
  /** Whether the login flow uses a popup or a full-page redirect. */
  loginStyle?: "popup" | "redirect";
  /** OAuth scopes to request in addition to the defaults. */
  requestPermissions?: string[];
  /** Extra parameters appended to the provider's login URL. */
  loginUrlParameters?: { [key: string]: unknown };
  /** URL to redirect back to after a redirect-style login. */
  redirectUrl?: string;
}

/**
 * Called when a credential request completes. Receives the credential token
 * (a string) on success, or an `Error` on failure.
 */
type CredentialRequestCompleteCallback = (tokenOrError?: string | Error) => void;

/** The pending OAuth credential resolved server-side. */
interface OAuthCredential {
  serviceName: string;
  serviceData: Record<string, unknown>;
  [key: string]: unknown;
}

export namespace Twitter {
  /**
   * (Client) Start the Twitter OAuth flow and obtain a credential token.
   * Accepts either `(options, callback)` or `(callback)`.
   */
  export function requestCredential(
    options?: RequestCredentialOptions | CredentialRequestCompleteCallback,
    credentialRequestCompleteCallback?: CredentialRequestCompleteCallback
  ): void;

  /**
   * (Server) Retrieve the pending credential for a completed OAuth flow.
   */
  export function retrieveCredential(
    credentialToken: string,
    credentialSecret?: string
  ): Promise<OAuthCredential | undefined>;

  /** Query parameters allowed on Twitter's `authenticate` endpoint. */
  export const validParamsAuthenticate: string[];

  /** Twitter profile fields copied into the user's `services.twitter`. */
  export const whitelistedFields: string[];
}
