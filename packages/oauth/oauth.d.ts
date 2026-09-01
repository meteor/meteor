import { Mongo } from 'meteor/mongo';

export type OAuthLoginStyle = 'popup' | 'redirect';

export interface OAuthStateParam {
  loginStyle: OAuthLoginStyle;
  credentialToken: string;
  isCordova?: boolean;
  redirectUrl?: string;
}

export interface OAuthPopupDimensions {
  width?: number;
  height?: number;
}

export interface OAuthLaunchLoginOptions {
  loginService: string;
  loginStyle: OAuthLoginStyle;
  loginUrl: string;
  credentialToken: string;
  credentialRequestCompleteCallback: (credentialToken: string, error?: Error) => void;
  popupOptions?: OAuthPopupDimensions;
}

export interface OAuthDataAfterRedirect {
  loginService: string;
  credentialToken: string;
  credentialSecret: string | null;
}

export interface OAuthServiceUrls {
  requestToken?: string;
  authorize?: string;
  accessToken?: string;
  authenticate?: string;
}

export interface OAuthRequestData {
  serviceName: string;
  version: 1 | 2;
  query: Record<string, string>;
  httpMethod?: string;
}

export type OAuthRequestHandler = (
  request: OAuthRequestData
) => { serviceData?: Record<string, unknown>; options?: Record<string, unknown> } | Promise<{ serviceData?: Record<string, unknown>; options?: Record<string, unknown> }> | null | undefined;

export interface OAuthPendingCredentialDocument {
  _id?: string;
  key: string;
  credential: unknown;
  credentialSecret: string | null;
  createdAt: Date;
}

export const OAuth: {
  /** Launches a popup window for interactive OAuth flows. Implemented per architecture. */
  showPopup(url: string, callback: () => void, dimensions?: OAuthPopupDimensions): void;

  /** Starts an OAuth login flow (popup or redirect). */
  launchLogin(options: OAuthLaunchLoginOptions): void;

  /** Persists state across a redirect-style login for later retrieval. */
  saveDataForRedirect(loginService: string, credentialToken: string): void;

  /** Reads state that was stored before the OAuth redirect. Returns null during normal startup. */
  getDataAfterRedirect(): OAuthDataAfterRedirect | null;

  /** Registers a server-side OAuth service handler. */
  registerService(
    name: string,
    version: 1 | 2,
    urls: OAuthServiceUrls | null,
    handleOauthRequest: OAuthRequestHandler
  ): void;

  /** Retrieves a pending credential and removes it from storage. */
  retrieveCredential(
    credentialToken: string,
    credentialSecret?: string | null
  ): Promise<unknown | Error | undefined>;

  /** Stores a pending OAuth credential keyed by credentialToken. */
  _storePendingCredential(
    credentialToken: string,
    credential: unknown,
    credentialSecret?: string | null
  ): Promise<void>;

  /** Retrieves and removes a pending credential. */
  _retrievePendingCredential(
    credentialToken: string,
    credentialSecret?: string | null
  ): Promise<unknown | Error | undefined>;

  /** Collection backing `_storePendingCredential`. */
  _pendingCredentials: Mongo.Collection<OAuthPendingCredentialDocument>;

  _redirectUri(
    serviceName: string,
    config: Record<string, unknown>,
    params?: Record<string, unknown>,
    absoluteUrlOptions?: Record<string, unknown>
  ): string;

  _storageTokenPrefix: string;

  _loginStyle(
    service: string,
    config: { loginStyle?: string },
    options?: { loginStyle?: string }
  ): OAuthLoginStyle;

  _stateParam(loginStyle: OAuthLoginStyle, credentialToken: string, redirectUrl?: string): string;

  _generateState(loginStyle: OAuthLoginStyle, credentialToken: string, redirectUrl?: string): string;

  _stateFromQuery(query: Record<string, string>): OAuthStateParam;

  _loginStyleFromQuery(query: Record<string, string>): OAuthLoginStyle;

  _credentialTokenFromQuery(query: Record<string, string>): string | undefined;

  _isCordovaFromQuery(query: Record<string, string>): boolean;

  _checkRedirectUrlOrigin(redirectUrl: string): boolean;

  _handleCredentialSecret(credentialToken: string, secret: string): void;

  _retrieveCredentialSecret(credentialToken: string): string | null | undefined;

  /** Server-only helper: seals a value using oauth-encryption when available. */
  sealSecret<T>(plaintext: T): T;

  /** Server-only helper: opens a sealed value. */
  openSecret<T>(maybeSecret: T, userId?: string | null): T;

  openSecrets(serviceData: Record<string, unknown>, userId?: string | null): Record<string, unknown>;
};

export const OAuthTest: {
  unregisterService(name: string): void;
};
