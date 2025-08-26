// Similar to oauth_pending_credentials.js but for 2FA challenges

import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check, Match } from 'meteor/check';

// When an oauth request with 2FA is made, Meteor receives oauth credentials
// and determines 2FA is required. It temporarily persists the 2FA challenge
// while the user completes 2FA verification.
//
// _pending2FACredentials is the storage mechanism used to persist the
// 2FA challenge data between the initial OAuth success and 2FA completion

// Collection containing pending 2FA challenges of oauth credential requests
// Has credentialToken, challengeData, credentialSecret, and createdAt fields.
const OAuth2FA = {};

OAuth2FA._pending2FACredentials = new Mongo.Collection(
  "meteor_oauth_pending_2fa_credentials", {
    _preventAutopublish: true
  }
);

// Create indexes with TTL for automatic expiration
async function init() {
  await OAuth2FA._pending2FACredentials.createIndexAsync('credentialToken', { unique: true });
  await OAuth2FA._pending2FACredentials.createIndexAsync('credentialSecret');
  // TTL index - documents expire after 600 seconds (10 minutes)
  await OAuth2FA._pending2FACredentials.createIndexAsync(
    'createdAt',
    { expireAfterSeconds: 600 }
  );
}
init();

// Note: Manual cleanup is no longer needed thanks to TTL index
// Removed _cleanStale2FAResults and _cleanup2FAHandle

// Stores the 2FA challenge data in the _pending2FACredentials collection.
// Will throw an exception if `credentialToken` is not a string.
//
// @param credentialToken {string} Unique token to identify this 2FA challenge
// @param challengeData {Object} The 2FA challenge data to store
// @param credentialSecret {string} A secret that must be presented to retrieve the challenge
OAuth2FA._storePending2FACredential = 
  async (credentialToken, challengeData, credentialSecret = null) => {
    check(credentialToken, String);
    check(credentialSecret, Match.Maybe(String));

    // Return the promise directly to avoid unnecessary await overhead
    return OAuth2FA._pending2FACredentials.upsertAsync({
      credentialToken,
    }, {
      credentialToken,
      challengeData,
      credentialSecret,
      createdAt: new Date()
    });
  };

// Retrieves a 2FA challenge from the _pending2FACredentials collection
// Does NOT remove it - allows retry until expiry
//
// @param credentialToken {string}
// @param credentialSecret {string}
OAuth2FA._retrievePending2FACredential =
  async (credentialToken, credentialSecret = null) => {
    check(credentialToken, String);

    const pending2FACredential = await OAuth2FA._pending2FACredentials.findOneAsync({
      credentialToken,
      credentialSecret,
    });

    if (pending2FACredential) {
      return pending2FACredential.challengeData;
    }
    
    return undefined;
  };

// Removes a 2FA challenge after successful completion or cancellation
//
// @param credentialToken {string}
// @param credentialSecret {string}
OAuth2FA._removePending2FACredential =
  async (credentialToken, credentialSecret = null) => {
    check(credentialToken, String);

    // Return the promise directly to avoid unnecessary await overhead
    return OAuth2FA._pending2FACredentials.removeAsync({
      credentialToken,
      credentialSecret,
    });
  };

// Export for server-side usage
export { OAuth2FA };