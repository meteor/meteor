import { Meteor } from 'meteor/meteor';
import { OAuth2FA } from './oauth_2fa_pending_credentials.js';
import { Random } from 'meteor/random';

// Listen to calls to `login` with an oauth option set. This is where
// users actually get logged in to meteor via oauth.
Accounts.registerLoginHandler(async options => {
  if (!options.oauth)
    return undefined; // don't handle

  check(options.oauth, {
    credentialToken: String,
    // When an error occurs while retrieving the access token, we store
    // the error in the pending credentials table, with a secret of
    // null. The client can call the login method with a secret of null
    // to retrieve the error.
    credentialSecret: Match.OneOf(null, String)
  });

  const result = await OAuth.retrieveCredential(options.oauth.credentialToken,
                                        options.oauth.credentialSecret);

  if (!result) {
    // OAuth credentialToken is not recognized, which could be either
    // because the popup was closed by the user before completion, or
    // some sort of error where the oauth provider didn't talk to our
    // server correctly and closed the popup somehow.
    //
    // We assume it was user canceled and report it as such, using a
    // numeric code that the client recognizes (XXX this will get
    // replaced by a symbolic error code at some point
    // https://trello.com/c/kMkw800Z/53-official-ddp-specification). This
    // will mask failures where things are misconfigured such that the
    // server doesn't see the request but does close the window. This
    // seems unlikely.
    //
    // XXX we want `type` to be the service name such as "facebook"
    return { type: "oauth",
             error: new Meteor.Error(
               Accounts.LoginCancelledError.numericError,
               "No matching login attempt found") };
  }

  if (result instanceof Error)
    // We tried to login, but there was a fatal error. Report it back
    // to the user.
    throw result;

  if (!Accounts.oauth.serviceNames().includes(result.serviceName)) {
    // serviceName was not found in the registered services list.
    // This could happen because the service never registered itself or
    // unregisterService was called on it.
    return { type: "oauth",
             error: new Meteor.Error(
               Accounts.LoginCancelledError.numericError,
               `No registered oauth service found for: ${result.serviceName}`) };
  }

  const userResult = await Accounts.updateOrCreateUserFromExternalService(
    result.serviceName, 
    result.serviceData, 
    result.options
  );

  // Early return pattern - inverted conditionals to reduce nesting
  if (!userResult.userId) {
    return userResult;
  }

  const user = await Meteor.users.findOneAsync({ _id: userResult.userId });
  
  if (!Accounts._check2faEnabled(user)) {
    return userResult;
  }

  // 2FA is enabled - create challenge
  const credentialToken = Random.secret();
  
  const challengeData = {
    userId: userResult.userId,
    serviceName: result.serviceName,
    connectionId: this.connection?.id,  // Optional: for additional security
    ip: this.connection?.clientAddress   // Optional: for logging
  };
  
  await OAuth2FA._storePending2FACredential(credentialToken, challengeData);
  
  return { 
    type: "oauth",
    error: new Meteor.Error("[2fa enabled]", "2fa is enabled", credentialToken) 
  };
});

Accounts.registerLoginHandler('verify2FA', async function(loginRequest) {
  const { credentialToken, otp } = loginRequest;

  check(credentialToken, String);
  check(otp, Match.Where(x => {
    check(x, String);
    return /^\d{6}$/.test(x);
  }));

  const challengeData = await OAuth2FA._retrievePending2FACredential(credentialToken);
  
  if (!challengeData) {
    return { 
      type: "verify2FA",
      error: new Meteor.Error("invalid-token", "Invalid or expired 2FA challenge") 
    };
  }
  
  const userId = challengeData.userId;
  
  const user = await Meteor.users.findOneAsync(
    { 
      _id: userId,
      'services.twoFactorAuthentication.secret': { $exists: true }
    },
    {
      fields: {
        'services.twoFactorAuthentication.secret': 1
      }
    }
  );

  if (!user) {
    // Remove the challenge since user no longer exists or 2FA disabled
    await OAuth2FA._removePending2FACredential(credentialToken);
    return { 
      type: "verify2FA",
      error: new Meteor.Error("user-not-found", "User not found or 2FA disabled") 
    };
  }

  // Verify the OTP
  if (!Accounts._isTokenValid(user.services.twoFactorAuthentication.secret, otp)) {
    // Failed OTP - don't remove challenge, let them retry until expiry
    return { 
      type: "verify2FA",
      error: new Meteor.Error("invalid-2fa-code", "Invalid verification code") 
    };
  }

  // Success! Remove the challenge from MongoDB
  await OAuth2FA._removePending2FACredential(credentialToken);
  
  return { 
    type: challengeData.serviceName,
    userId: userId 
  };
});

///
/// OAuth Encryption Support
///

const OAuthEncryption = Package["oauth-encryption"]?.OAuthEncryption;

const usingOAuthEncryption = () => {
  return OAuthEncryption?.keyIsLoaded();
};

// Encrypt unencrypted login service secrets when oauth-encryption is
// added.
//
// XXX For the oauthSecretKey to be available here at startup, the
// developer must call Accounts.config({oauthSecretKey: ...}) at load
// time, instead of in a Meteor.startup block, because the startup
// block in the app code will run after this accounts-base startup
// block.  Perhaps we need a post-startup callback?

Meteor.startup(() => {
  if (!usingOAuthEncryption()) {
    return;
  }

  const { ServiceConfiguration } = Package['service-configuration'];

  ServiceConfiguration.configurations.find({
    $and: [{
      secret: { $exists: true }
    }, {
      "secret.algorithm": { $exists: false }
    }]
  }).forEachAsync(async (config) => {
    await ServiceConfiguration.configurations.updateAsync(config._id, {
      $set: {
        secret: OAuthEncryption.seal(config.secret)
      }
    });
  });
});