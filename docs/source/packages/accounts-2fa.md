---
title: accounts-2fa
description: Documentation of Meteor's `accounts-2fa` package.
---

The package `accounts-2fa` allows you to easily integrate 2FA with the OTP technology on your login flow.

The first step to use 2FA is to generate a QR code so the user can read it on an authenticator app and start to receiving codes.
{% apibox "Accounts.generate2faActivationQrCode" "module":"accounts-base" %}


{% apibox "Accounts.enableUser2fa" "module":"accounts-base" %}
Once the user has the codes, now the 2FA can enable by calling this function with a code.

{% apibox "Accounts.disableUser2fa" "module":"accounts-base" %}
Use this function to give the users the option of disabling the 2FA.

{% apibox "Accounts.has2FAEnabled" "module":"accounts-base" %}
Use this function to verify if the user has 2FA enabled.

<h3 id="log-in-with-code">Log in with code</h3>

Once this package is added, the method `Meteor.loginWithPassword` starts to accept on additional parameter, which is the token: `Meteor.loginWithPassword(selector, password, token, [callback])`.

If the user has 2FA enabled, they only will be able to log in if they provide a valid code.

You can see examples on how to use this package on it's [read.me](https://github.com/meteor/meteor/tree/feature/accounts-2fa-package/packages/accounts-2fa).
