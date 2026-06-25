# accounts-google

The `accounts-google` package is the login service that lets users of your app sign in with their Google account, using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `google-oauth` package, registering Google as an available login service and exposing a client-side `Meteor.loginWithGoogle` helper.

Add it to your project with:

```bash
meteor add accounts-google
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `google-oauth`, so the `Accounts` API and the underlying `Google` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an OAuth application with Google and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. If you use `accounts-ui` but have not configured the service through `service-configuration`, the package prints a console notice suggesting you also add the matching configuration UI:

```bash
meteor add google-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithGoogle` function.

```js
Meteor.loginWithGoogle(options, (error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithGoogle([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying Google OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with Google. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to Google's login page. Once the user authorizes the app, the Meteor client logs in to the server with the credentials returned by Google.

> On Cordova, when Google Sign-In is available, `Meteor.loginWithGoogle` uses Google's native `Google.signIn` flow instead of a web pop-up. This is required because, after April 2017, Google OAuth login no longer works inside a WebView. See [meteor/meteor#8253](https://github.com/meteor/meteor/issues/8253).

#### Requesting permissions

To request additional permissions (scopes) from the user, pass an array in `options.requestPermissions`:

```js
Meteor.loginWithGoogle({
  requestPermissions: ['profile', 'email'],
});
```

When `requestPermissions` is not provided, `accounts-google` requests the `profile` scope by default. The user's `accessToken` is stored in the `services.google` field of their user document, so it can be used later to call the Google API on their behalf. The set of supported scope values is defined by Google; see [Google's OAuth scopes reference](https://developers.google.com/identity/protocols/oauth2/scopes). For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services, see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E).

#### Additional Google-specific options

Beyond `requestPermissions`, the following options are recognized and translated into Google login URL parameters:

- **`requestOfflineToken`** **Boolean** — when `true`, sets Google's `access_type` to `offline` so a refresh token is issued; when `false`, sets it to `online`.
- **`prompt`** **String** — passed through as Google's `prompt` parameter (for example `"consent"` or `"select_account"`). As a backwards-compatible alternative, `forceApprovalPrompt: true` sets `prompt` to `"consent"`.
- **`loginHint`** **String** — passed through as Google's `login_hint` parameter to pre-fill the account to use.
- **`loginUrlParameters`** **Object** — additional Google login URL parameters merged into the request.

These option-to-parameter mappings are implemented in `google-oauth`'s client. See [Google's authentication URI parameters](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters) for the full list.

#### Restricting account creation by email domain

If you call `Accounts.config({ restrictCreationByEmailDomain: 'example.com' })` with a string domain, `accounts-google` automatically adds Google's `hd` login URL parameter so Google's account chooser is scoped to that hosted domain. Note that this only changes Google's UI — `accounts-base` still verifies the user's email address on the server.

## Setting up the Google app

1. In the [Google Cloud Console](https://console.cloud.google.com/) go to **APIs & Services → Credentials** and create an **OAuth client ID** of type **Web application**.
2. Copy the **Client ID** and **Client Secret** — these are the `clientId` and `secret` you configure below.
3. Add your redirect URI under **Authorized redirect URIs**. Meteor handles the callback at:

   ```
   <your-root-url>/_oauth/google
   ```

   e.g. `http://localhost:3000/_oauth/google` in development.

Note: Google always adds the `email` scope to the request, even if you only ask for `profile`.

### Native Google Sign-In on Cordova

On Cordova, `Meteor.loginWithGoogle` uses the native `Google.signIn` flow (web OAuth no longer works inside a WebView). To make it work you additionally need:

- a **separate OAuth client** of type Android and/or iOS in the Google Cloud Console (distinct from the Web `clientId` above), and
- the matching **reversed client ID** configured for the build (the `google-oauth` package pulls in the Cordova Google Sign-In plugin).

Consult the current Google Sign-In Cordova plugin documentation for the exact per-platform values.

## A complete example

**1. Configure the OAuth credentials** on the server (for example in `server/main.js`). Google uses `clientId`/`secret`:

```js
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'google' },
  {
    $set: {
      loginStyle: 'popup', // or 'redirect' (use 'redirect' for mobile/Cordova)
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET',
    },
  },
);
```

See [OAuth Services Configuration](./service-configuration.md) for the `settings.json` alternative and where to obtain these credentials.

**2. Trigger the login.** With Blaze you can drop in the ready-made widget from [`accounts-ui`](./accounts-ui.md):

```handlebars
{{> loginButtons}}
```

Or call the login function directly from your own button — this works with React, Vue, Svelte, plain JS, etc.:

```js
function signIn() {
  Meteor.loginWithGoogle(
    { requestPermissions: ['profile', 'email'] },
    (error) => {
      if (error) {
        // The user closing the popup rejects with Accounts.LoginCancelledError.
        console.error(error);
      }
    },
  );
}
```

**3. Read the signed-in user.** After a successful login the profile and token live under `services.google`:

```js
const user = Meteor.user(); // reactive on the client
// user.services.google.id, user.services.google.accessToken, ...
```

**4. Log out:**

```js
Meteor.logout();
```

## Server behavior

On the server, `accounts-google` registers the `google` OAuth service and, when the `autopublish` package is enabled, publishes the following fields of the Google service data:

- For the logged-in user: Google's whitelisted profile fields plus `accessToken` and `expiresAt` (the refresh token is not published).
- For other users: the whitelisted profile fields excluding `email` and `verified_email`.

The whitelisted fields are defined by `google-oauth` and include `id`, `email`, `verified_email`, `name`, `given_name`, `family_name`, `picture`, `locale`, `timezone`, and `gender`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.
