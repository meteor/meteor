import type { OAuth } from "meteor/oauth";

export namespace MeteorDeveloperAccounts {
  function requestCredential(
    options: {
      loginStyle?: "popup" | "redirect";
      redirectUrl?: string;
      details?: string;
      loginHint?: string;
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
