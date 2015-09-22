{{#template name="apiPasswords"}}

<h2 id="accounts_passwords"><span>Passwords</span></h2>

The `accounts-password` package contains a full system for password-based
authentication. In addition to the basic username and password-based
sign-in process, it also supports email-based sign-in including
address verification and password recovery emails.

The Meteor server stores passwords using the
[bcrypt](http://en.wikipedia.org/wiki/Bcrypt) algorithm. This helps
protect against embarrassing password leaks if the server's database is
compromised.

To add password support to your application, run this command in your terminal:

```bash
meteor add accounts-password
```

You can construct your own user interface using the
functions below, or use the [`accounts-ui` package](#accountsui) to
include a turn-key user interface for password-based sign-in.


{{> autoApiBox "Accounts.createUser"}}

On the client, this function logs in as the newly created user on
successful completion. On the server, it returns the newly created user
id.

On the client, you must pass `password` and at least one of `username` or
`email` &mdash; enough information for the user to be able to log in again
later. If there are existing users with a username or email only differing in
case, `createUser` will fail. On the server, you do not need to specify
`password`, but the user will not be able to log in until it has a password (eg,
set with [`Accounts.setPassword`](#accounts_setpassword)).

To create an account without a password on the server and still let the
user pick their own password, call `createUser` with the `email` option
and then
call [`Accounts.sendEnrollmentEmail`](#accounts_sendenrollmentemail). This
will send the user an email with a link to set their initial password.

By default the `profile` option is added directly to the new user document. To
override this behavior, use [`Accounts.onCreateUser`](#accounts_oncreateuser).

This function is only used for creating users with passwords. The external
service login flows do not use this function.

### Managing usernames and emails

Instead of modifying documents in the [`Meteor.users`](#meteor_users) collection
directly, use these convenience functions which correctly check for case
insensitive duplicates before updates.

{{> autoApiBox "Accounts.setUsername"}}

{{> autoApiBox "Accounts.addEmail"}}

By default, an email address is added with `{ verified: false }`. Use
[`Accounts.sendVerificationEmail`](#Accounts-sendVerificationEmail) to send an
email with a link the user can use verify their email address.

{{> autoApiBox "Accounts.removeEmail"}}

{{> autoApiBox "Accounts.verifyEmail"}}

This function accepts tokens passed into the callback registered with
[`Accounts.onEmailVerificationLink`](#Accounts-onEmailVerificationLink).

{{> autoApiBox "Accounts.findUserByUsername"}}

{{> autoApiBox "Accounts.findUserByEmail"}}

### Managing passwords

Use the below functions to initiate password changes or resets from the server
or the client.

{{> autoApiBox "Accounts.changePassword"}}

{{> autoApiBox "Accounts.forgotPassword"}}

This triggers a call
to [`Accounts.sendResetPasswordEmail`](#accounts_sendresetpasswordemail)
on the server. When the user visits the link in this email, the callback
registered with [`Accounts.onResetPasswordLink`](#Accounts-onResetPasswordLink)
will be called.

If you are using the [`accounts-ui` package](#accountsui), this is handled
automatically. Otherwise, it is your responsiblity to prompt the user for the
new password and call `resetPassword`.

{{> autoApiBox "Accounts.resetPassword"}}

This function accepts tokens passed into the callbacks registered with
[`AccountsClient#onResetPasswordLink`](#Accounts-onResetPasswordLink) and
[`Accounts.onEnrollmentLink`](#Accounts-onEnrollmentLink).

{{> autoApiBox "Accounts.setPassword"}}



<h3 id="sending-emails"><span>Sending emails</span></h3>

{{> autoApiBox "Accounts.sendResetPasswordEmail"}}

When the user visits the link in this email, the callback registered with
[`AccountsClient#onResetPasswordLink`](#Accounts-onResetPasswordLink) will be called.

To customize the contents of the email, see
[`Accounts.emailTemplates`](#accounts_emailtemplates).

{{> autoApiBox "Accounts.sendEnrollmentEmail"}}

When the user visits the link in this email, the callback registered with
[`Accounts.onEnrollmentLink`](#Accounts-onEnrollmentLink) will be called.

To customize the contents of the email, see
[`Accounts.emailTemplates`](#accounts_emailtemplates).

{{> autoApiBox "Accounts.sendVerificationEmail"}}

When the user visits the link in this email, the callback registered with
[`Accounts.onEmailVerificationLink`](#Accounts-onEmailVerificationLink) will
be called.

To customize the contents of the email, see
[`Accounts.emailTemplates`](#accounts_emailtemplates).


{{> autoApiBox "Accounts.onResetPasswordLink"}}

{{> autoApiBox "Accounts.onEnrollmentLink"}}

{{> autoApiBox "Accounts.onEmailVerificationLink"}}




{{> autoApiBox "Accounts.emailTemplates"}}

This is an `Object` with several fields that are used to generate text/html
for the emails sent by `sendResetPasswordEmail`, `sendEnrollmentEmail`,
and `sendVerificationEmail`.

Override fields of the object by assigning to them:

- `from`: A `String` with an [RFC5322](http://tools.ietf.org/html/rfc5322) From
   address. By default, the email is sent from `no-reply@meteor.com`. If you
   wish to receive email from users asking for help with their account, be sure
   to set this to an email address that you can receive email at.
- `siteName`: The public name of your application. Defaults to the DNS name of
   the application (eg: `awesome.meteor.com`).
- `headers`: An `Object` for custom email headers as described in
    [`Email.send`](#email_send).
- `resetPassword`: An `Object` with the fields:
 - `from`: A `Function` used to override the `from` address defined
   by the `emailTemplates.from` field.
 - `subject`: A `Function` that takes a user object and returns
   a `String` for the subject line of a reset password email.
 - `text`: An optional `Function` that takes a user object and a url, and
   returns the body text for a reset password email.
 - `html`: An optional `Function` that takes a user object and a
   url, and returns the body html for a reset password email.
- `enrollAccount`: Same as `resetPassword`, but for initial password setup for
   new accounts.
- `verifyEmail`: Same as `resetPassword`, but for verifying the users email
   address.


Example:

```js
Accounts.emailTemplates.siteName = "AwesomeSite";
Accounts.emailTemplates.from = "AwesomeSite Admin <accounts@example.com>";
Accounts.emailTemplates.enrollAccount.subject = function (user) {
    return "Welcome to Awesome Town, " + user.profile.name;
};
Accounts.emailTemplates.enrollAccount.text = function (user, url) {
   return "You have been selected to participate in building a better future!"
     + " To activate your account, simply click the link below:\n\n"
     + url;
};
```

{{/template}}
