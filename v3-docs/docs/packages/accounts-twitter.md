# accounts-twitter

The `accounts-twitter` package is the login service that lets users of your app sign in with their Twitter/X account, using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `twitter-oauth` package, registering Twitter as an available login service and exposing a client-side `Meteor.loginWithTwitter` helper.

Add it to your project with:

```bash
meteor add accounts-twitter
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `twitter-oauth`, so the `Accounts` API and the underlying `Twitter` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an application with Twitter and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. When you use `accounts-ui` together with `accounts-twitter`, the package will print a console notice suggesting you also add the matching configuration UI:

```bash
meteor add twitter-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithTwitter` function.

```js
Meteor.loginWithTwitter((error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithTwitter([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying Twitter OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with Twitter. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to Twitter's authorization page. Once the user authorizes the app, the Meteor client logs in to the server with the credentials returned by Twitter.

For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services — including Twitter's `force_login` parameter — see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E). Note that, unlike some other services, `requestPermissions` is not currently supported for Twitter.

## A complete example

**1. Configure the OAuth credentials** on the server (for example in `server/main.js`). Twitter uses `consumerKey`/`secret`:

```js
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'twitter' },
  {
    $set: {
      loginStyle: 'popup', // or 'redirect' (use 'redirect' for mobile/Cordova)
      consumerKey: 'YOUR_CONSUMER_KEY',
      secret: 'YOUR_CONSUMER_SECRET',
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
  Meteor.loginWithTwitter((error) => {
    if (error) {
      // The user closing the popup rejects with Accounts.LoginCancelledError.
      console.error(error);
    }
  });
}
```

**3. Read the signed-in user.** After a successful login the profile lives under `services.twitter`:

```js
const user = Meteor.user(); // reactive on the client
// user.services.twitter.id, user.services.twitter.screenName, ...
```

**4. Log out:**

```js
Meteor.logout();
```

## Server behavior

On the server, `accounts-twitter` registers the `twitter` OAuth service and, when the `autopublish` package is enabled, publishes a fixed set of `services.twitter` fields to all clients (the access token is intentionally **not** published). The published fields are Twitter's whitelisted profile fields plus `id` and `screenName`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.
