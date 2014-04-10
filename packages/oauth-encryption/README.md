# oauth-encryption

Encrypts sensitive login secrets stored in the database such as a
login service's application secret key and users' access tokens.


## Generating a Key

The encryption key is 16 bytes, encoded in base64.

To generate a key:

    $ ~/.meteor/tools/latest/bin/node -e 'console.log(require("crypto").randomBytes(16).toString("base64"))'


## Using oauth-encryption with accounts

On the server only, use the `oauthSecretKey` option to `Accounts.config`:

    Accounts.config({oauthSecretKey: "onsqJ+1e4iGFlV0nhZYobg=="});

This call to `Accounts.config` should be made at load time (place at
the top level of your source file), not called from inside of a
`Meteor.startup` block.

To avoid storing the secret key in your application's source code, you
can use [`Meteor.settings`](http://docs.meteor.com/#meteor_settings):

    Accounts.config({oauthSecretKey: Meteor.settings.oauthSecretKey});


## Using oauth-encryption without accounts

If you're using the oauth packages directly instead of through the
Meteor accounts packages, you can load the OAuth encryption key
directly using `OAuthEncryption.loadKey`:

    OAuthEncryption.loadKey("onsqJ+1e4iGFlV0nhZYobg==");

If you call `retrieveCredential` (such as
`Twitter.retrieveCredential`) as part of your process, you'll find
when using oauth-encryption that the sensitive service data fields
will be encrypted.

You can decrypt them using `OAuth.openSecrets`:

    var credentials = Twitter.retrieveCredential(token);
    var serviceData = OAuth.openSecrets(credentials.serviceData);
