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
- **`passwordlessSignupFields`** **String** — which fields to display in the passwordless user-creation form. One of `'USERNAME_AND_EMAIL'` or `'EMAIL_ONLY'`.

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

You can also provide these same options through `Meteor.settings.public.packages['accounts-ui-unstyled']` instead of calling `Accounts.ui.config`.

## Styling the widgets

Because this package ships no CSS, you add your own. The `{{> loginButtons}}` widget renders a predictable DOM structure with stable ids and classes you can target. The main hooks (from `login_buttons*.html`) are:

- `#login-buttons` — the root container; it also gets a `login-buttons-dropdown-align-<align>` class.
- `.login-button` and `.single-login-button` — the clickable buttons.
- `#login-buttons-<service>` — the per-service sign-in button, e.g. `#login-buttons-google`, `#login-buttons-facebook`.
- `.login-image` / `#login-buttons-image-<service>` — the per-service icon slot.
- `.text-besides-image` — the button label.
- `#login-buttons-logout` — the "Sign Out" button shown when logged in.
- `.login-display-name` — the logged-in user's name.
- `.message.error-message` and `.message.info-message` — status/error messages.
- `.no-services` — shown when no login service is configured.

When password or multiple OAuth services are configured, the widget renders in **dropdown** mode and also shows sign-in/sign-up **forms**. Additional hooks for those:

- `#login-dropdown-list` (with class `.accounts-dialog`) — the dropdown panel; `#login-sign-in-link` and `#login-name-link` (class `.login-link-text`) toggle it.
- `.login-form.login-password-form` and `.login-form.login-passwordless-form` — the sign-in/sign-up forms.
- `#login-email`, `#login-password`, `#login-username` — the form inputs.
- `#signup-link`, `#forgot-password-link`, `#back-to-login-link` — the navigation links inside the form.
- `.accounts-dialog` — shared class for the dropdown and the configuration/message dialogs.

Add a stylesheet to your app that targets these, for example:

```css
#login-buttons .login-button {
  padding: 8px 12px;
  border-radius: 6px;
}
#login-buttons-google .login-image {
  background-image: url('/icons/google.svg');
}
#login-buttons .error-message {
  color: #c0392b;
}
```

> Tip: if you just want a working default look, use the [`accounts-ui`](./accounts-ui.md) package instead — it is exactly this package plus a default stylesheet (`login_buttons.import.css`). You can also read that file as a starting point for your own theme.

## See also

- [accounts-ui](./accounts-ui.md) — the styled version of these widgets (this package plus a default stylesheet).
- [Accounts API](../api/accounts.md) — the core `Accounts` API and login services.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials for the external login buttons.
