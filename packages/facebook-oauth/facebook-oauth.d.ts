/** Options accepted by `Facebook.requestCredential`. */
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

export namespace Facebook {
  /**
   * (Client) Start the Facebook OAuth flow and obtain a credential token.
   * Accepts either `(options, callback)` or `(callback)`.
   */
  export function requestCredential(
    credentialRequestCompleteCallback?: CredentialRequestCompleteCallback
  ): void;
  export function requestCredential(
    options: RequestCredentialOptions,
    credentialRequestCompleteCallback?: CredentialRequestCompleteCallback
  ): void;
  export function requestCredential(
    options: RequestCredentialOptions | undefined,
    credentialRequestCompleteCallback: CredentialRequestCompleteCallback
  ): void;

  /**
   * (Server) Retrieve the pending credential for a completed OAuth flow.
   */
  export function retrieveCredential(
    credentialToken: string,
    credentialSecret?: string | null
  ): Promise<OAuthCredential | undefined>;

  /**
   * (Server) Build a service-data object directly from a Facebook access
   * token, bypassing the interactive OAuth flow.
   */
  export function handleAuthFromAccessToken(
    accessToken: string,
    expiresAt: number
  ): Promise<Record<string, unknown>>;
}
