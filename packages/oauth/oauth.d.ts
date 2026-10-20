import * as http from "http";
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

/** The popup flow needs the completion callback; the redirect flow ignores it. */
export type OAuthLaunchLoginOptions = {
  loginService: string;
  loginUrl: string;
  credentialToken: string;
} & (
  | {
      loginStyle: 'popup';
      credentialRequestCompleteCallback: (credentialToken: string, error?: Error) => void;
      popupOptions?: OAuthPopupDimensions;
    }
  | {
      loginStyle: 'redirect';
      credentialRequestCompleteCallback?: (credentialToken: string, error?: Error) => void;
      popupOptions?: OAuthPopupDimensions;
    }
);

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

/** What a service handler returns; `serviceData` ends up in `user.services[name]`. */
export interface OAuthHandlerResult {
  serviceData: Record<string, unknown>;
  options?: Record<string, unknown>;
}

/** OAuth 2 handler: receives the query string of the provider's callback request. */
export type OAuth2RequestHandler = {
  bivarianceHack(query: Record<string, string>): OAuthHandlerResult | Promise<OAuthHandlerResult>;
}["bivarianceHack"];

/** OAuth 1 handler: receives the prepared `OAuth1Binding` and the callback query. */
export type OAuth1RequestHandler = {
  bivarianceHack(
    binding: unknown,
    request: { query: Record<string, string> }
  ): OAuthHandlerResult | Promise<OAuthHandlerResult>;
}["bivarianceHack"];

/** Handler for a service whose arguments are chosen by a custom `_requestHandlers` entry. */
export type OAuthRequestHandler = {
  bivarianceHack(...args: unknown[]): OAuthHandlerResult | Promise<OAuthHandlerResult>;
}["bivarianceHack"];

export interface OAuthRegisteredService {
  serviceName: string;
  version: number | string;
  urls: OAuthServiceUrls | null;
  handleOauthRequest: OAuthRequestHandler;
}

/** Per-version middleware stored in `OAuth._requestHandlers`; it must end the response. */
export type OAuthVersionRequestHandler = (
  service: OAuthRegisteredService,
  query: Record<string, string>,
  res: http.ServerResponse
) => Promise<void>;

export interface OAuthCredential {
  serviceName: string;
  serviceData: Record<string, unknown>;
  options?: Record<string, unknown>;
}

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
    version: 2,
    urls: null,
    handleOauthRequest: OAuth2RequestHandler
  ): void;
  registerService(
    name: string,
    version: 1,
    urls: OAuthServiceUrls,
    handleOauthRequest: OAuth1RequestHandler
  ): void;
  registerService(
    name: string,
    version: number | string,
    urls: OAuthServiceUrls | null,
    handleOauthRequest: OAuthRequestHandler
  ): void;

  /** Retrieves a pending credential and removes it from storage. Resolves to the stored `Error` when the flow failed. */
  retrieveCredential(
    credentialToken: string,
    credentialSecret?: string | null
  ): Promise<OAuthCredential | Error | undefined>;

  /** Maps an OAuth version to its callback middleware; `oauth1` and `oauth2` register `'1'` and `'2'`. */
  _requestHandlers: Record<string, OAuthVersionRequestHandler>;

  /** Stores a pending OAuth credential keyed by credentialToken. */
  _storePendingCredential(
    credentialToken: string,
    credential: unknown,
    credentialSecret?: string | null
  ): Promise<void>;

  /** Retrieves and removes a pending credential. Overridable, so the stored shape is not assumed. */
  _retrievePendingCredential(
    credentialToken: string,
    credentialSecret?: string | null
  ): Promise<unknown>;

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
