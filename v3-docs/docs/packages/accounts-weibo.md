# accounts-weibo

The `accounts-weibo` package is the login service that lets users of your app sign in with their [Sina Weibo](https://weibo.com) account, using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `weibo-oauth` package, registering Weibo as an available login service and exposing a client-side `Meteor.loginWithWeibo` helper.

Add it to your project with:

```bash
meteor add accounts-weibo
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `weibo-oauth`, so the `Accounts` API and the underlying `Weibo` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an application with Weibo and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. If you use `accounts-ui` but have not configured the service through `service-configuration`, the package prints a console notice suggesting you also add the matching configuration UI:

```bash
meteor add weibo-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithWeibo` function.

```js
Meteor.loginWithWeibo((error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithWeibo([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying Weibo OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with Weibo. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to Weibo's authorization page. Once the user authorizes the app, the Meteor client logs in to the server with the credentials returned by Weibo.

For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services, see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E). Note that `requestPermissions` is not currently supported for Weibo.

## Setting up the Weibo app

1. Create an app on the [Weibo Open Platform](https://open.weibo.com/).
2. Copy the **App Key** and **App Secret** — these map to `clientId` and `secret` below.
3. Register your redirect URI. Meteor handles the callback at:

   ```
   <your-root-url>/_oauth/weibo
   ```

   e.g. `http://localhost:3000/_oauth/weibo` in development.

## A complete example

**1. Configure the OAuth credentials** on the server (for example in `server/main.js`). Weibo uses `clientId`/`secret`:

```js
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'weibo' },
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
  Meteor.loginWithWeibo((error) => {
    if (error) {
      // The user closing the popup rejects with Accounts.LoginCancelledError.
      console.error(error);
    }
  });
}
```

**3. Read the signed-in user.** After a successful login the profile and token live under `services.weibo`:

```js
const user = Meteor.user(); // reactive on the client
// user.services.weibo.id, user.services.weibo.screenName, ...
```

**4. Log out:**

```js
Meteor.logout();
```

## What's stored on the user

After login, Weibo profile data is stored under `services.weibo`: `id`, `screenName`, plus `accessToken` and `expiresAt`. The user's `profile.name` is set from the Weibo screen name on account creation.

## Server behavior

On the server, `accounts-weibo` registers the `weibo` OAuth service and, when the `autopublish` package is enabled, publishes the following fields of the Weibo service data:

- For the logged-in user: the entire `services.weibo` object (including the access token, which can legitimately be used from the client over HTTPS or on localhost).
- For other users: `services.weibo.screenName`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.
