export interface ConfigureBetterAuthOptions {
  auth: any;
  toNodeHandler?: (auth: any) => any;
  basePath?: string;
  cookieName?: string;
}

export interface BetterAuthPasswordOptions {
  revokeOtherSessions?: boolean;
}

declare module "meteor/accounts-base" {
  namespace Accounts {
    function configureBetterAuth(options: ConfigureBetterAuthOptions): any;
    function getBetterAuth(): any;
    function setBetterAuthClient(client: any): void;
    function getBetterAuthClient(): any;
    function syncBetterAuthSession(sessionToken?: string | null): Promise<any>;
    function refreshBetterAuthConnection(): Promise<void>;
    function signInWithBetterAuth(email: string, password: string): Promise<any>;
    function signUpWithBetterAuth(
      email: string,
      password: string,
      name?: string
    ): Promise<any>;
    function signOutWithBetterAuth(): Promise<void>;
    function sendVerificationEmailWithBetterAuth(email: string): Promise<any>;
    function requestPasswordResetWithBetterAuth(
      email: string,
      redirectTo?: string
    ): Promise<any>;
    function resetPasswordWithBetterAuth(
      token: string,
      newPassword: string
    ): Promise<any>;
    function changePasswordWithBetterAuth(
      currentPassword: string,
      newPassword: string,
      options?: BetterAuthPasswordOptions
    ): Promise<any>;
    function verifyEmailWithBetterAuth(token: string): Promise<any>;
  }
}
