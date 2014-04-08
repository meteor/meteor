# oauth-encryption

Encrypts sensitive login secrets stored in the database such as a
login service's application secret key and users' access tokens.


## Generating a Key

The encryption key is 16 bytes, encoded in base64.

To generate a key using Meteor, create a temporary application:

    $ meteor create gen
    $ cd gen

Then create `server/gen.js`:

    console.log("key:", Npm.require("crypto").randomBytes(16).toString("base64"));

When you start Meteor, your generated base64 encoded key will be
printed.  You can then delete the temporary application.


## Using the Key

On the server only, use the `oauthSecretKey` option to `Accounts.config`:

    Accounts.config({oauthSecretKey: "onsqJ+1e4iGFlV0nhZYobg=="});

To avoid storing the secret key in your application's source code, you
can use [`Meteor.settings`](http://docs.meteor.com/#meteor_settings):

    Accounts.config({oauthSecretKey: Meteor.settings.oauthSecretKey});
