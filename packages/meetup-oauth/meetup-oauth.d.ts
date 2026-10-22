import type { OAuth } from "meteor/oauth";

export namespace Meetup {
  function requestCredential(
    options: {
      requestPermissions?: string[];
      loginStyle?: "popup" | "redirect";
      redirectUrl?: string;
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
}
