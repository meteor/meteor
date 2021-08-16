---
title: Email
description: Documentation of Meteor's email API.
---

The `email` package allows sending email from a Meteor app. To use it, add the
package to your project by running in your terminal:

```bash
meteor add email
```

The server reads from the `MAIL_URL` environment variable to determine how to
send mail. The `MAIL_URL` should reference an
[SMTP](https://en.wikipedia.org/wiki/Simple_Mail_Transfer_Protocol) server and
use the form `smtp://USERNAME:PASSWORD@HOST:PORT` or
`smtps://USERNAME:PASSWORD@HOST:PORT`.  The `smtps://` form (the `s` is for
"secure") should be used if the mail server requires TLS/SSL (and does not use
`STARTTLS`) and is most common on port 465.  Connections which start unencrypted
prior to being upgraded to TLS/SSL (using `STARTTLS`) typically use port 587
(and _sometimes_ 25) and should use `smtp://`.  For more information see the
[Nodemailer docs](https://nodemailer.com/smtp/)

If `MAIL_URL` is not set, `Email.send` outputs the message to standard output
instead.

{% apibox "Email.send" %}

You must provide the `from` option and at least one of `to`, `cc`, and `bcc`;
all other options are optional.

`Email.send` only works on the server. Here is an example of how a
client could use a server method call to send an email. (In an actual
application, you'd need to be careful to limit the emails that a
client could send, to prevent your server from being used as a relay
by spammers.)

```js
// Server: Define a method that the client can call.
Meteor.methods({
  sendEmail(to, from, subject, text) {
    // Make sure that all arguments are strings.
    check([to, from, subject, text], [String]);

    // Let other method calls from the same client start running, without
    // waiting for the email sending to complete.
    this.unblock();

    Email.send({ to, from, subject, text });
  }
});

// Client: Asynchronously send an email.
Meteor.call(
  'sendEmail',
  'Alice <alice@example.com>',
  'bob@example.com',
  'Hello from Meteor!',
  'This is a test of Email.send.'
);
```

{% apibox "Email.hookSend" %}

`hookSend` is a convenient hook if you want to: prevent sending certain emails, 
send emails via your own integration instead of the default one provided by
Meteor, or do something else with the data. This is especially useful
if you want to intercept emails sent by core packages like accounts-password
or other packages where you can't modify the email code.

The hook function will receive an object with the options for Nodemailer.
