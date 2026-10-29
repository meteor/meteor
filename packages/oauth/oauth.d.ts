import type { EJSONableProperty } from "meteor/ejson";
import type { Meteor } from "meteor/meteor";
import type { Configuration } from "meteor/service-configuration";

export namespace OAuth {
  /** Client-side functions */

  function _redirectUri(
    serviceName: string,
    config: unknown,
    params?: Record<string, unknown>,
    absoluteUrlOptions?: Meteor.absoluteUrlOptions
  ): string;

  type LoginStyle = "popup" | "redirect";

  function _loginStyle(
    service: string,
    config: Configuration,
    options?: { loginStyle?: string }
  ): LoginStyle;

  function _stateParam(
    loginStyle: LoginStyle,
    credentialToken: string,
    redirectUrl?: string
  ): string;

  function _retrieveCredentialSecret(
    credentialToken: string
  ): string | undefined | null;

  function launchLogin(options: {
    loginService: string;
    loginStyle: LoginStyle;
    loginUrl: string;
    credentialRequestCompleteCallback: (credentialToken: string) => void;
    credentialToken: string;
    popupOptions?: { width?: number; height?: number };
  }): void;

  /** Server-side functions */

  type OAuthResult =
    | undefined
    | null
    | {
        serviceData: Record<string, EJSONableProperty>;
        options?: Record<string, EJSONableProperty>;
      };

  interface Sealed<T> {
    _oauthSealedBrand: void;
  }

  type Secret<T> = Sealed<T> | T;

  function sealSecret<T>(plaintext: T): Secret<T>;
  function openSecret<T>(secret: Secret<T>, userId?: string): T;

  // This interface is augmented by the oauth1 and oauth2 packages to define the
  // types of OAuth versions supported.
  interface OAuthVersions {
    [version: number]: {
      urls: unknown;
      query: unknown;
    };
  }

  function registerService<V extends keyof OAuthVersions>(
    name: string,
    version: V,
    urls: OAuthVersions[V]["urls"],
    handleOauthRequest: (
      query: OAuthVersions[V]["query"]
    ) => OAuthResult | Promise<OAuthResult>
  ): void;
  function unregisterService(name: string): void;

  function retrieveCredential(
    credentialToken: string,
    credentialSecret?: string
  ): Promise<Secret<OAuthResult>>;
}
