import type { OAuth } from "meteor/oauth";

export namespace Twitter {
  function requestCredential(
    options: {
      loginStyle?: "popup" | "redirect";
      redirectUrl?: string;
      force_login?: string;
      screen_name?: string;
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
