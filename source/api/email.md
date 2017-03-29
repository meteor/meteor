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
send mail. Currently, Meteor supports sending mail over SMTP; the `MAIL_URL`
environment variable should be of the form
`smtp://USERNAME:PASSWORD@HOST:PORT`.

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
  'alice@example.com',
  'bob@example.com',
  'Hello from Meteor!',
  'This is a test of Email.send.'
);
```
