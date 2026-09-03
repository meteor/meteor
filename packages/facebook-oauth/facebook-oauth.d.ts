import type { Meteor } from "meteor/meteor";
import type { OAuth } from "meteor/oauth";

export namespace Facebook {
  function requestCredential(
    options: {
      requestPermissions?: string[];
      loginStyle?: "popup" | "redirect";
      params?: Record<string, string>;
      absoluteUrlOptions?: Meteor.absoluteUrlOptions;
      auth_type?: string;
    },
    credentialRequestCompleteCallback?: (
      credentialTokenOrError: string | Error
    ) => void
  ): void;
  function requestCredential(
    credentialRequestCompleteCallback?: (
      credentialTokenOrError: string | Error
    ) => void
  ): void;

  function retrieveCredential(
    credentialToken: string,
    credentialSecret?: string
  ): Promise<OAuth.Secret<OAuth.OAuthResult>>;

  function handleAuthFromAccessToken(
    accessToken: string,
    expiresAt: number
  ): Promise<OAuth.Secret<OAuth.OAuthResult>>;
}
