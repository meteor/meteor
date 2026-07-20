# accounts-facebook

The `accounts-facebook` package is the login service that lets users of your app sign in with their Facebook account, using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `facebook-oauth` package, registering Facebook as an available login service and exposing a client-side `Meteor.loginWithFacebook` helper.

Add it to your project with:

```bash
meteor add accounts-facebook
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `facebook-oauth`, so the `Accounts` API and the underlying `Facebook` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an application with Facebook and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. If you use `accounts-ui` but have not configured the service through `service-configuration`, the package prints a console notice suggesting you also add the matching configuration UI:

```bash
meteor add facebook-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithFacebook` function.

```js
Meteor.loginWithFacebook(options, (error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithFacebook([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying Facebook OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with Facebook. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to Facebook's login page. Once the user authorizes the app, the Meteor client logs in to the server with the credentials returned by Facebook.

#### Requesting permissions

By default — when `requestPermissions` is omitted — `facebook-oauth` requests the `email` scope. To request additional permissions from the user, pass an array of scopes in `options.requestPermissions`:

```js
Meteor.loginWithFacebook({
  requestPermissions: ['public_profile', 'email'],
});
```

The user's `accessToken` is stored in the `services.facebook` field of their user document, so it can be used later to call the Facebook API on their behalf. The set of supported permission values is defined by Facebook; see [Facebook's permissions reference](https://developers.facebook.com/docs/permissions/reference). For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services, see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E).

## Setting up the Facebook app

1. Go to [developers.facebook.com](https://developers.facebook.com/) and create an app with **Facebook Login**.
2. Copy the **App ID** and **App Secret** — these are the `appId` and `secret` you configure below.
3. Add your app's OAuth redirect URI to **Valid OAuth Redirect URIs**. Meteor handles the callback at:

   ```text
   <your-root-url>/_oauth/facebook
   ```

   e.g. `http://localhost:3000/_oauth/facebook` in development and `https://yourapp.com/_oauth/facebook` in production. A mismatch here is the most common cause of login failures.

## A complete example

**1. Configure the OAuth credentials** on the server (for example in `server/main.js`). Facebook uses `appId`/`secret`:

```js
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'facebook' },
  {
    $set: {
      loginStyle: 'popup', // or 'redirect' (use 'redirect' for mobile/Cordova)
      appId: 'YOUR_APP_ID',
      secret: 'YOUR_APP_SECRET',
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
  Meteor.loginWithFacebook(
    { requestPermissions: ['public_profile', 'email'] },
    (error) => {
      if (error) {
        // The user closing the popup rejects with Accounts.LoginCancelledError.
        console.error(error);
      }
    },
  );
}
```

**3. Read the signed-in user.** After a successful login the profile and token live under `services.facebook`:

```js
const user = Meteor.user(); // reactive on the client
// user.services.facebook.id, user.services.facebook.accessToken, ...
```

**4. Log out:**

```js
Meteor.logout();
```

## What's stored on the user

After login, Facebook profile data is stored under `services.facebook`. The fields actually requested by `facebook-oauth` are: `id`, `email`, `name`, `first_name`, `last_name`, `middle_name`, `name_format`, `picture`, and `short_name`, plus `accessToken` and `expiresAt`. The user's `profile.name` is also set from the Facebook name on account creation. The Graph API version can be set via the `facebook-oauth` package settings (`Meteor.settings.public.packages['facebook-oauth'].apiVersion`).

## Server behavior

On the server, `accounts-facebook` registers the `facebook` OAuth service and, when the `autopublish` package is enabled, publishes the following fields of the Facebook service data:

- For the logged-in user: the entire `services.facebook` object (including the access token, which can legitimately be used from the client over HTTPS or on localhost).
- For other users: `services.facebook.id`, `services.facebook.username`, and `services.facebook.gender`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.
