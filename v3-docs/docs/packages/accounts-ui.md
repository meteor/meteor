# accounts-ui

A turn-key user interface for Meteor Accounts.

To add Accounts and a set of login controls to an application, add the
`accounts-ui` package and at least one login provider package:
`accounts-password`, `accounts-facebook`, `accounts-github`,
`accounts-google`, `accounts-twitter`, or `accounts-weibo`.

Then simply add the <span v-pre>`{{> loginButtons}}`</span> helper to an HTML file. This
will place a login widget on the page. If there is only one provider configured
and it is an external service, this will add a login/logout button. If you use
`accounts-password` or use multiple external login services, this will add
a "Sign in" link which opens a dropdown menu with login options. If you plan to
position the login dropdown in the right edge of the screen, use
<span v-pre>`{{> loginButtons align="right"}}`</span> in order to get the dropdown to lay
itself out without expanding off the edge of the screen.

To configure the behavior of <span v-pre>`{{> loginButtons}}`</span>, use
[`Accounts.ui.config`](../api/accounts.md#loggingIn).

`accounts-ui` also includes modal popup dialogs to handle links from
[`sendResetPasswordEmail`](../api/accounts.md#Accounts-sendResetPasswordEmail),
[`sendVerificationEmail`](../api/accounts.md#Accounts-sendVerificationEmail),
and [`sendEnrollmentEmail`](../api/accounts.md#Accounts-sendEnrollmentEmail). These
do not have to be manually placed in HTML: they are automatically activated
when the URLs are loaded.

## Customizing the UI

If you want to control the look and feel of your accounts system a little more, we recommend reading the [useraccounts](http://guide.meteor.com/accounts.html#useraccounts) section of the Meteor Guide.

### CSS Variables

The `accounts-ui` package uses CSS variables for styling, making it easy to customize the appearance to match your application. You can override these variables in your own CSS to create a custom theme.

#### Basic Usage

To customize the styling, add CSS variables to your application's CSS:

```css
/* In your app CSS */
:root {
  /* Override light theme variables */
  --login-buttons-color: #4e40b8;
  --color-background-primary: #ffffff;
  
  /* Override dark theme variables */
  --login-buttons-color-dark: #8c7ae6;
  --color-background-primary-dark: #121212;
}
```

#### Dark Theme Support

The package automatically supports dark mode using the `prefers-color-scheme: dark` media query. You can customize both light and dark themes independently.

#### Available Variables

Here's a complete list of CSS variables you can customize with the current default values:

##### Layout and Sizing
```css
--meteor-accounts-dialog-border-width: 1px;
--login-buttons-accounts-dialog-width: 280px;
--button-border-radius: 6px;
--input-border-radius: 6px;
--dialog-border-radius: 12px;
```

##### Colors - Light Theme
```css
--login-buttons-color: #4e40b8;
--login-buttons-color-active: #6c5ce7;
--login-buttons-config-color: #cc3a1a;
--login-buttons-config-border: #b8351a;
--color-text-primary: #2d2d2d;
--color-text-secondary: #4a4a4a;
--color-text-disabled: #999;
--color-background-primary: #fff;
--color-background-secondary: #f8f9fa;
--color-background-disabled: #e0e0e0;
--color-border: #e6e6e6;
--color-input-border: #d1d1d1;
--color-input-focus-border: var(--login-buttons-color);
--color-error: #e74c3c;
--color-success: #2ecc71;
--color-overlay: rgba(0, 0, 0, 0.6);
```

##### Colors - Dark Theme
```css
--login-buttons-color-dark: #8c7ae6;
--login-buttons-color-active-dark: #a29bfe;
--color-text-primary-dark: #f5f5f5;
--color-text-secondary-dark: #d1d1d1;
--color-text-disabled-dark: #777;
--color-background-primary-dark: #121212;
--color-background-secondary-dark: #1e1e1e;
--color-background-disabled-dark: #444;
--color-border-dark: #333;
--color-input-border-dark: #444;
--color-input-focus-border-dark: var(--login-buttons-color-dark);
--color-error-dark: #ff6b6b;
--color-success-dark: #55efc4;
--color-overlay-dark: rgba(0, 0, 0, 0.8);
```

##### Typography
```css
--font-family-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
--font-family-monospace: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
--font-size-base: 16px;
--font-size-small: 0.875rem;
--font-size-smaller: 0.8125rem;
--font-size-smallest: 0.75rem;
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-bold: 600;
--line-height-base: 1.5;
```

##### Effects
```css
--box-shadow-dialog: 0 10px 25px rgba(0, 0, 0, 0.1);
--box-shadow-button-active: 0 2px 4px 0 rgba(0, 0, 0, 0.1) inset;
--box-shadow-input-focus: 0 0 0 3px rgba(78, 64, 184, 0.2);
--box-shadow-dialog-dark: 0 10px 25px rgba(0, 0, 0, 0.3);
--box-shadow-button-active-dark: 0 2px 4px 0 rgba(0, 0, 0, 0.3) inset;
--box-shadow-input-focus-dark: 0 0 0 3px rgba(140, 122, 230, 0.3);
```

##### Transitions
```css
--transition-speed-fast: 0.1s;
--transition-speed-normal: 0.2s;
--transition-speed-slow: 0.3s;
--transition-timing: cubic-bezier(0.25, 0.1, 0.25, 1);
```
