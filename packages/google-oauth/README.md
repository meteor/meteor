# google-oauth
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/google-oauth) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/google-oauth)
***

An implementation of the Google OAuth flow. See the [project page](https://docs.meteor.com/api/accounts) on Meteor Accounts for more details.
[Google's documentation](https://developers.google.com/identity/protocols/oauth2)

## Signing in with a native Google token

The `googleSignIn: true` login method checks that the access token was issued for this application before logging the user in. A token passes when one of these is true:

- it was issued to the `clientId` in the `google` service configuration, for example after the server exchanges a `serverAuthCode`;
- it was issued to a client listed in the optional `additionalClientIds` array of that configuration;
- it comes with an `idToken` whose audience is one of those clients and whose user is the same Google account. Native Google Sign-In SDKs return such an ID token when you configure them with your web client ID.

Apps that send access tokens from the iOS or Android Google Sign-In SDKs without an ID token can list those client IDs:

```json
{
  "packages": {
    "service-configuration": {
      "google": {
        "clientId": "WEB_CLIENT_ID.apps.googleusercontent.com",
        "secret": "...",
        "additionalClientIds": [
          "IOS_CLIENT_ID.apps.googleusercontent.com",
          "ANDROID_CLIENT_ID.apps.googleusercontent.com"
        ]
      }
    }
  }
}
```

Only list client IDs from your own Google Cloud project.
