/** Options accepted by `Google.requestCredential`. */
interface RequestCredentialOptions {
  /** Whether the login flow uses a popup or a full-page redirect. */
  loginStyle?: "popup" | "redirect";
  /** OAuth scopes to request in addition to the defaults. */
  requestPermissions?: string[];
  /** Extra parameters appended to the provider's login URL. */
  loginUrlParameters?: { [key: string]: unknown };
  /** URL to redirect back to after a redirect-style login. */
  redirectUrl?: string;
  /** Request an offline (refresh) token. */
  requestOfflineToken?: boolean;
  /** Force the Google consent screen. */
  forceApprovalPrompt?: boolean;
  /** Value for Google's `prompt` login parameter. */
  prompt?: string;
  /** Pre-fill the account chooser with this email. */
  loginHint?: string;
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

export namespace Google {
  /**
   * (Client) Start the Google OAuth flow and obtain a credential token.
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
   * (Cordova) Sign in using the native Google Sign-In SDK.
   * Accepts either `(options, callback)` or `(callback)`.
   */
  export function signIn(
    options?: RequestCredentialOptions | CredentialRequestCompleteCallback,
    callback?: CredentialRequestCompleteCallback
  ): void;

  /** (Cordova) Sign out of the native Google Sign-In session. */
  export function signOut(): Promise<void>;

  /** Google profile fields copied into the user's `services.google`. */
  export const whitelistedFields: string[];
}
