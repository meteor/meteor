import type { OAuth } from "meteor/oauth";

export namespace Google {
  function requestCredential(
    options: {
      requestPermissions?: string[];
      loginStyle?: "popup" | "redirect";
      loginUrlParameters?: Record<string, string>;
      requestOfflineToken?: boolean;
      prompt?: "none" | "consent" | "select_account";
      forceApprovalPrompt?: boolean;
      loginHint?: string;
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
