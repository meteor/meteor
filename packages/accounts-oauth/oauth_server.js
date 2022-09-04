import { Meteor } from 'meteor/meteor';

// Listen to calls to `login` with an oauth option set. This is where
// users actually get logged in to meteor via oauth.
Accounts.registerLoginHandler(options => {
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

  const result = OAuth.retrieveCredential(options.oauth.credentialToken,
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
  else {
    if (! Accounts.oauth.serviceNames().includes(result.serviceName)) {
      // serviceName was not found in the registered services list.
      // This could happen because the service never registered itself or
      // unregisterService was called on it.
      return { type: "oauth",
               error: new Meteor.Error(
                 Accounts.LoginCancelledError.numericError,
                 `No registered oauth service found for: ${result.serviceName}`) };

    }
    return Accounts.updateOrCreateUserFromExternalService(result.serviceName, result.serviceData, result.options);
  }
});

///
/// OAuth Encryption Support
///

const OAuthEncryption =
  Package["oauth-encryption"] &&
  Package["oauth-encryption"].OAuthEncryption;

const usingOAuthEncryption = () => {
  return OAuthEncryption && OAuthEncryption.keyIsLoaded();
};

// OAuth service data is temporarily stored in the pending credentials
// collection during the oauth authentication process.  Sensitive data
// such as access tokens are encrypted without the user id because
// we don't know the user id yet.  We re-encrypt these fields with the
// user id included when storing the service data permanently in
// the users collection.
//
const pinEncryptedFieldsToUser = (serviceData, userId) => {
  Object.keys(serviceData).forEach(key => {
    let value = serviceData[key];
    if (OAuthEncryption && OAuthEncryption.isSealed(value))
      value = OAuthEncryption.seal(OAuthEncryption.open(value), userId);
    serviceData[key] = value;
  });
};

// Validate new user's email or Google/Facebook/GitHub account's email
function defaultValidateNewUserHook(user) {
  const domain = this._options.restrictCreationByEmailDomain;
  if (!domain) {
    return true;
  }

  let emailIsGood = false;
  if (user.emails && user.emails.length > 0) {
    emailIsGood = user.emails.reduce(
      (prev, email) => prev || this._testEmailDomain(email.address), false
    );
  } else if (user.services && Object.values(user.services).length > 0) {
    // Find any email of any service and check it
    emailIsGood = Object.values(user.services).reduce(
      (prev, service) => service.email && this._testEmailDomain(service.email),
      false,
    );
  }

  if (emailIsGood) {
    return true;
  }

  if (typeof domain === 'string') {
    throw new Meteor.Error(403, `@${domain} email required`);
  } else {
    throw new Meteor.Error(403, "Email doesn't match the criteria.");
  }
}

// Encrypt unencrypted login service secrets when oauth-encryption is
// added.
//
// XXX For the oauthSecretKey to be available here at startup, the
// developer must call Accounts.config({oauthSecretKey: ...}) at load
// time, instead of in a Meteor.startup block, because the startup
// block in the app code will run after this accounts-base startup
// block.  Perhaps we need a post-startup callback?

Meteor.startup(() => {
  if (! usingOAuthEncryption()) {
    return;
  }

  Accounts._validateNewUserHooks = [
    defaultValidateNewUserHook.bind(this)
  ];

  const { ServiceConfiguration } = Package['service-configuration'];

  ServiceConfiguration.configurations.find({
    $and: [{
      secret: { $exists: true }
    }, {
      "secret.algorithm": { $exists: false }
    }]
  }).forEach(config => {
    ServiceConfiguration.configurations.update(config._id, {
      $set: {
        secret: OAuthEncryption.seal(config.secret)
      }
    });
  });
});
