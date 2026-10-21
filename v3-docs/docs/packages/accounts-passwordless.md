# Passwordless

Passwordless package allows you to create a login for users without the need for user to provide password. Upon registering or login an email is sent to the user's email with a code to enter to confirm login and a link to login directly. Since the user is responding to the email it will also verify the email.

The first step to in the passwordless process is for the user to sign-up or request a token to their email address. You can do that with the following:
<ApiBox name="Accounts.requestLoginTokenForUser" from="accounts-base" hasCustomExample/>

If the user is signing up you can pass in the `userData` object like in [Accounts.createUser](/api/accounts#Accounts-createUser).

The client wrapper reports completion through a callback. For an existing account, request a token and handle errors as follows:

```js
import { Accounts } from "meteor/accounts-base";

Accounts.requestLoginTokenForUser(
  {
    selector: { email: "ada@lovelace.com" },
    options: { userCreationDisabled: true },
  },
  (error) => {
    if (error) {
      console.error(
        error.error === "too-many-requests"
          ? "Wait before requesting another login token."
          : error.reason || error.message
      );
      return;
    }
    console.log("Check your email for the login token.");
  }
);
```

You can also use an email or username string as `selector`. An object selector must contain exactly one non-empty `id`, `username`, or `email` string.

Starting with Meteor 3.6, token requests use the default Accounts limit of five requests every ten seconds per method and connection. Handle `too-many-requests` in the callback, show the error in your login form, and wait before enabling another resend attempt. This wrapper does not return a Promise; see the [Accounts tutorial](/tutorials/accounts/accounts#requesting-a-login-token) for an example that wraps the callback for `await`.

If you call the DDP method directly, pass one object containing only `selector`, `userData`, and `options`. Use an object selector with one supported identifier. The server validates the payload before looking up or creating an account and returns error `400` for invalid input. `userData` can contain custom fields for account-creation hooks; its `username` and `email` values must be strings or null when supplied.

<ApiBox name="Meteor.passwordlessLoginWithToken" />
The second step in the passwordless flow. Like all the other `loginWith` functions call this method to login the user with the token they have inputted.

<ApiBox name="Accounts.sendLoginTokenEmail"  from="accounts-base" />
Use this function if you want to manually send the email to users to login with token from the server. Do note that you will need to create the token/sequence and save it in the DB yourself. This is good if you want to change how the tokens look or are generated, but unless you are sure of what you are doing we don't recommend it.

<h3 id="config-options">Settings Options</h3>

You can use the function `Accounts.config` in the server to change some settings on this package:

- **tokenSequenceLength**: use `Accounts.config({tokenSequenceLength: _Number_})` to the size of the token sequence generated. The default is 6.

- **loginTokenExpirationHours**: use `Accounts.config({loginTokenExpirationHours: _Number_})` to set the amount of time a token sent is valid. As it's just a number, you can use, for example, 0.5 to make the token valid for just half hour. The default is 1 hour.

<h3 id="passwordless-email-templates">E-mail templates</h3>

`accounts-passwordless` brings new templates that you can edit to change the look of emails which send code to users. The email template is named `sendLoginToken` and beside `user` and `url`, the templates also receive a data object with `sequence` which is the user's code.

```javascript
sendLoginToken: {
  text: (user, url, { sequence }) => {
    /* text template */
  };
}
```

<h3 id="enabling-2fa">Enable 2FA for this package</h3>

You can add 2FA to your login flow by using the package [accounts-2fa](./accounts-2fa.md).
You can find an example showing how this would look like [here](./accounts-2fa.md#working-with-accounts-passwordless).
