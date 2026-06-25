# accounts-ui-unstyled

`accounts-ui-unstyled` provides the login widgets used by [`accounts-ui`](./accounts-ui.md) — the <span v-pre>`{{> loginButtons}}`</span> template and the `Accounts.ui.config` configuration API — **without** the default CSS. Use it directly when you want the drop-in login UI but intend to supply your own styling.

The [`accounts-ui`](./accounts-ui.md) package is simply `accounts-ui-unstyled` plus a default stylesheet. If you add `accounts-ui`, you already have everything here; add `accounts-ui-unstyled` instead only when you want to style the widgets yourself.

Add it to your project with:

```bash
meteor add accounts-ui-unstyled
```

To actually log users in you also need at least one login service package, such as [`accounts-password`](../api/accounts.md#passwords) or an OAuth service like `accounts-google`.

## The login buttons template

The package defines a Blaze template named `loginButtons`. Render it anywhere in your templates to get a sign-in / sign-up UI:

```handlebars
{{> loginButtons}}
```

Because this package ships no CSS, the buttons appear unstyled until you add your own styles (or use the [`accounts-ui`](./accounts-ui.md) package, which provides a default stylesheet).

## `Accounts.ui.config(options)`

Configure the behavior of the <span v-pre>`{{> loginButtons}}`</span> widget. Based on the JSDoc and validation in `packages/accounts-ui-unstyled/accounts_ui.js`, the recognized options are:

- **`passwordSignupFields`** **String** — which fields to display in the user-creation form. One of `'USERNAME_AND_EMAIL'`, `'USERNAME_AND_OPTIONAL_EMAIL'`, `'USERNAME_ONLY'`, or `'EMAIL_ONLY'` (the default).
- **`requestPermissions`** **Object** — maps an external service to the [permissions](../api/accounts.md#requestpermissions) to request from the user for that service.
- **`requestOfflineToken`** **Object** — maps an external service to `true` to ask for permission to act on the user's behalf when offline. Currently only supported with Google.
- **`forceApprovalPrompt`** **Object** — maps an external service to `true` to force the user to approve the app's permissions even if previously approved. Currently only supported with Google.

```js
import { Accounts } from 'meteor/accounts-base';

Accounts.ui.config({
  passwordSignupFields: 'USERNAME_AND_EMAIL',
  requestPermissions: {
    google: ['email', 'profile'],
  },
});
```

Passing an unknown option throws an error (`Accounts.ui.config: Invalid option: ...`).

## See also

- [accounts-ui](./accounts-ui.md) — the styled version of these widgets (this package plus a default stylesheet).
- [Accounts API](../api/accounts.md) — the core `Accounts` API and login services.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials for the external login buttons.
