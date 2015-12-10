---
title: Users and Accounts
---

After reading this article, you'll know:

1. What features in core Meteor enable user accounts
2. How to use accounts-ui for a quick prototype
3. How to build a fully-featured password login experience
4. How to enable login through OAuth providers like Facebook
5. How to use the useraccounts family of packages to build your login UI
6. How to add custom data to Meteor's users collection
7. How to enable users to log in to the same account with different providers
8. How to manage user roles and permissions

## Features in core Meteor

Before we get into all of the different user-facing accounts functionality you can add with Meteor, let's go over some of the features built into the Meteor DDP protocol and `accounts-base` package. These are the parts of Meteor that you'll definitely need to be aware of if you have any user accounts in your app; most of everything else is optional and added/removed via packages.

### userId in DDP

DDP is Meteor's built-in pub/sub and RPC protocol. You can read about how to use it in the [Data Loading](data-loading.html) and [Methods](methods.html) chapters. In addition to the concepts of data loading and remote method calls, DDP has one more feature built in - the idea of a `userId` field on a connection. This is the place where login state is tracked, regardless of which accounts UI package or login service you are using.

This built-in feature means that you always get `this.userId` inside Methods and Publications, and can access the user ID on the client. This is a great starting point for building your own custom accounts system, but most developers won't need to worry about the mechanics, since you'll mostly be interacting with the `accounts-base` package instead.

### `accounts-base`

This package is the core of Meteor's developer-facing user accounts functionality. This includes:

1. A users collection with a standard schema, accessed through [`Meteor.users`](http://docs.meteor.com/#/full/meteor_users), and the client-side singletons [`Meteor.userId()`](http://docs.meteor.com/#/full/meteor_userid) and [`Meteor.user()`](http://docs.meteor.com/#/full/meteor_user), which represent the login state on the client
2. A variety of helpful other generic methods to keep track of login state, log out, validate users, etc. Visit the [Accounts section of the docs](http://docs.meteor.com/#/full/accounts_api) to find a complete list.
3. An API for registering new login handlers, which is used by all of the other accounts packages to integrate with the accounts system. There isn't any official documentation for this API, but you can [read more about it on the MeteorHacks blog](https://meteorhacks.com/extending-meteor-accounts).

Usually, you don't need to include `accounts-base` yourself since it's added for you if you use `accounts-password` or similar, but it's good to be aware of what is what.

## Fast prototyping with `accounts-ui`

Often, a complicated accounts system is not the first thing you want to build when you're starting out with a new app, so it's useful to have something you can just drop in quickly. This is where `accounts-ui` comes in - it's just one line that you drop into your app to get an accounts system. To add it:

```js
meteor add accounts-ui
```

Then just include it anywhere in a Blaze template:

```html
{{> loginButtons}}
```

Then, make sure to pick a login provider; they will automatically integrate with `accounts-ui`:

```sh
# pick one or more of the below
meteor add accounts-password
meteor add accounts-facebook
meteor add accounts-google
meteor add accounts-github
meteor add accounts-twitter
meteor add accounts-meetup
meteor add accounts-meteor-developer
```

[XXX screenshot of accounts ui in action]

Now just open your app, follow the configuration steps, and you're good to go - if you've done the [Meteor tutorial](https://www.meteor.com/tutorials/blaze/adding-user-accounts), you've already seen this in action. Of course, in a production application, you probably want a more custom user interface and some logic to have a more tailored UX, but that's why we have the rest of this guide.

## Password login

Meteor comes with a secure and fully-featured password login system out of the box. To use it, add the package:

```sh
meteor add accounts-password
```

To see what options are available to you, read the complete description of the [`accounts-password` API in the Meteor docs](http://docs.meteor.com/#/full/accounts_passwords).

### Requiring username or email

Be default, the `Accounts.createUser` function provided by `accounts-password` allows you to create an account with a username, email, or both. Most apps expect a specific combination of the two, so you will certainly want to validate the new user creation:

```js
// Ensuring every user has an email address, should be in server-side code
// XXX should we use simple-schema here??
Accounts.validateNewUser((user) => {
  if (! user.email) {
    throw new Meteor.Error('Meteor.users.needEmail',
      'All users must have an email address.');
  }

  if (! user.username) {
    throw new Meteor.Error('Meteor.users.needUsername',
      'All users must have a username.');
  }

  // Return true to allow user creation to proceed
  return true;
});
```

### Multiple emails

Often, users might want to associate multiple email addresses with the same account. `accounts-password` addresses this case by storing the email addresses as an array in the user collection. There are some handy API methods to deal with [adding](http://docs.meteor.com/#/full/Accounts-addEmail), [removing](http://docs.meteor.com/#/full/Accounts-removeEmail), and [verifying](http://docs.meteor.com/#/full/accounts_verifyemail) emails.

One useful thing to add for your app can be the concept of a "primary" email address. This way, if the user has added multiple emails, you know where to send confirmation emails and similar.

### Case sensitivity

Before Meteor 1.2, all email addresses and usernames in the database were considered to be case-sensitive. This meant that if you registered an account as `AdaLovelace@example.com`, and then tried to log in with `adalovelace@example.com`, you'd see an error indicating that no user with that email exists. Of course, this can be quite confusing, so we decided to improve things in Meteor 1.2. But the situation was not as simple as it seemed; since MongoDB doesn't have a concept of case-insensitive indexes, it was impossible to guarantee unique emails at the database level. For this reason, we have added a bunch of new APIs for querying and updating users which manage the case-sensitivity problem at the application level.

#### What does this mean for my app?

Just follow one simple rule: don't query the database by `username` or `email` directly. Instead, use the [`Accounts.findUserByUsername`](http://docs.meteor.com/#/full/Accounts-findUserByUsername) and [`Accounts.findUserByEmail`](http://docs.meteor.com/#/full/Accounts-findUserByEmail) methods provided by Meteor. This will run a query for you that is case-insensitive, so you will always find the user you are looking for.

### Email flows

When you have a login system for your app based on user emails, that opens up the possibility for email-based account flows. The common thing between all of these workflows is that they involve sending a unique link to the user's email address, which does something special when it is clicked. Let's look at some common examples that Meteor's `accounts-password` package supports out of the box:

1. **Password reset.** When the user clicks the link in their email, they are taken to a page where they can enter a new password for their account.
1. **User enrollment.** A new user is created by an administrator, but no password is set. When the user clicks the link in their email, they are taken to a page where they can set a new password for their account. Very similar to password reset.
1. **Email verification.** When the user clicks the link in their email, the application records that this email does indeed belong to the correct user.

Here, we'll talk about how to manage the whole process manually from start to finish.

#### Working email flow out of the box

If you want something that just works out of the box, you can either use `accounts-ui` which does everything for you, or `useraccounts`, which we'll explain in more detail in the next section. Only follow the directions below if you definitely want to build all parts of the email flow yourself.

#### Sending the email

`accounts-password` comes with handy functions that you can call from the server to send an email. They are named for exactly what they do:

1. [`Accounts.sendResetPasswordEmail`](http://docs.meteor.com/#/full/accounts_sendresetpasswordemail)
2. [`Accounts.sendEnrollmentEmail`](http://docs.meteor.com/#/full/accounts_sendenrollmentemail)
3. [`Accounts.sendVerificationEmail`](http://docs.meteor.com/#/full/accounts_sendverificationemail)

The email is generated using the email templates from [Accounts.emailTemplates](http://docs.meteor.com/#/full/accounts_emailtemplates), and include links generated with `Accounts.urls`. We'll go into more detail about customizing the email content and URL later.

#### Identifying when the link is clicked

When the user receives the email and clicks the link inside, their web browser will take them to your app. Now, you need to be able to identify these special links and act appropriately. If you haven't customized the link URL, then you can use some built-in callbacks to identify when the app is in the middle of an email flow. When these callbacks are triggered, Meteor's accounts system enters a special state that can only be exited by calling the `done` function that is passed into the registered callback.

1. [`Accounts.onResetPasswordLink`](http://docs.meteor.com/#/full/Accounts-onResetPasswordLink)
2. [`Accounts.onEnrollmentLink`](http://docs.meteor.com/#/full/Accounts-onEnrollmentLink)
3. [`Accounts.onEmailVerificationLink`](http://docs.meteor.com/#/full/Accounts-onEmailVerificationLink)

If you have customized the URL, you will need to add a new route to your router that handles the URL you have specified.

#### Displaying an appropriate UI and completing the process

Now that you know that the user is attempting to reset their password, set an initial password, or verify their email, you should display an appropriate UI to allow them to do so. For example, you might want to show a page with a form for the user to enter their new password.

When the user submits the form, you need to call the appropriate function to commit their change to the database. Each of these functions takes the new value and the token you got from the event in the previous step.

1. [`Accounts.resetPassword`](http://docs.meteor.com/#/full/accounts_resetpassword) - this one should be used both for resetting the password, and enrolling a new user; it accepts both kinds of tokens.
2. [`Accounts.verifyEmail`](http://docs.meteor.com/#/full/accounts_verifyemail)

After you are have called one of the two functions above or the user has cancelled the process, call the `done` function you got in the link callback. This will tell Meteor to get out of the special state it enters when you're doing one of the email account flows.

### Customizing accounts emails

You will probably want to customize the emails `accounts-password` will send on your behalf. This can be easily done through the [`Accounts.emailTemplates` API](http://docs.meteor.com/#/full/accounts_emailtemplates). Below is some example code from the Todos app:

```js
Accounts.emailTemplates.siteName = "Meteor Guide Todos Example";
Accounts.emailTemplates.from = "Meteor Todos Accounts <accounts@example.com>";

Accounts.emailTemplates.resetPassword = {
  subject(user) {
    return "Reset your password on Meteor Todos";
  },
  text(user, url) {
    return `Hello!
Click the link below to reset your password on Meteor Todos.
${url}
If you didn't request this email, please ignore it.
Thanks,
The Meteor Todos team
`
  }
};
```

As you can see, we can use the ES2015 template string functionality to generate a multi-line string that includes the password reset URL. We can also set a custom `from` address and email subject.

#### HTML emails

If you've ever needed to deal with sending pretty HTML emails from an app, you know that it can quickly become a nightmare. Compatibility of popular email clients with basic HTML features like CSS is notoriously spotty, so it is hard to author something that works at all. Start with a [responsive email template](https://github.com/leemunroe/responsive-html-email-template) or [framework](http://foundation.zurb.com/emails/email-templates.html), and then use a tool to convert your email content into something that is compatible with all email clients. [This blog post by Mailgun covers some of the main issues with HTML email.](http://blog.mailgun.com/transactional-html-email-templates/)

## OAuth login

In the past, it was a huge headache to get Facebook or Google login to work with your app. Thankfully, most popular login providers have standardized around some version of [OAuth](https://en.wikipedia.org/wiki/OAuth). Meteor supports some of the most popular login services out of the box, and you can easily add your own using the underlying OAuth packages.

### Facebook, Google, and more

Here's a complete list of login providers for which Meteor provides core packages:

1. Facebook with `accounts-facebook`
2. Google with `accounts-google`
3. GitHub with `accounts-github`
4. Twitter with `accounts-twitter`
5. Meetup with `accounts-meetup`
6. Meteor Developer Accounts with `accounts-meteor-developer`

There is a core package for logging in with Weibo, but it is no longer being actively maintained.

### Logging in

If you are using an off-the-shelf login UI like `accounts-ui` or `useraccounts`, you don't need to write any code after adding the relevant package from the list above. If you are building a login experience from scratch, you can log in programmatically using the [`Meteor.loginWith<Service>`](http://docs.meteor.com/#/full/meteor_loginwithexternalservice) function. It looks like this:

```js
Meteor.loginWithFacebook({
  requestPermissions: ['user_friends', 'public_profile', 'email']
}, (err) => {
  if (err) {
    // handle error
  } else {
    // successful login!
  }
});
```

### Configuring OAuth

There are a few points to know about configuring OAuth login:

1. **Client ID and secret.** It's best to keep your OAuth secret keys outside of your source code, and pass them in is through Meteor.settings. Read how in the [Security article](security.html#api-keys-oauth).
2. **Redirect URL.** On the OAuth provider's side, you'll need to specify a _redirect URL_. The URL will look like: `example.com/_oauth/facebook`. Replace `facebook` with the name of the service you are using.
3. **Permissions.** Each login service provider should have documentation about which permissions are available. For example, [here is the page for Facebook](https://developers.facebook.com/docs/facebook-login/permissions). If you want additional permissions to the user's data when they log in, pass some of these strings in the `requestPermissions` option to `Meteor.loginWithFacebook`. In the next section we'll talk about how to retrieve that data.
