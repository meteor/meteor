---
title: accounts-passwordless
description: Documentation of Meteor's `accounts-passwordless` package.
---

Passwordless package allows you to create a login for users without the need for user to provide password. Upon registering or login an email is sent to the user's email with a code to enter to confirm login and a link to login directly.

{% apibox "Meteor.loginWithToken" %}
{% apibox "Accounts.requestLoginTokenForUser" %}
{% apibox "Accounts.sendLoginTokenEmail" %}

### E-mail templates

`accounts-passwordless` brings new templates that you can edit to change the look of emails which send code to users. The email template is named `sendLoginToken` and beside `user` and `url`, the templates also receive a data object with `sequence` which is the user's code.

```javascript
sendLoginToken: {
  text: (user, url, { sequence }) => { /* text template */ }
}
```
