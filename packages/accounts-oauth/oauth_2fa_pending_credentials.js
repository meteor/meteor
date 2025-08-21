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

// Create indexes
async function init() {
  await OAuth2FA._pending2FACredentials.createIndexAsync('credentialToken', { unique: true });
  await OAuth2FA._pending2FACredentials.createIndexAsync('credentialSecret');
  await OAuth2FA._pending2FACredentials.createIndexAsync('createdAt');
}
init();

// Periodically clear old 2FA challenges that were never completed
const _cleanStale2FAResults = async () => {
  // Remove 2FA challenges older than 10 minutes
  const timeCutoff = new Date();
  timeCutoff.setMinutes(timeCutoff.getMinutes() - 10);
  await OAuth2FA._pending2FACredentials.removeAsync({ createdAt: { $lt: timeCutoff } });
};

const _cleanup2FAHandle = Meteor.setInterval(_cleanStale2FAResults, 5 * 60 * 1000);

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

    // Upsert to handle duplicate tokens
    await OAuth2FA._pending2FACredentials.upsertAsync({
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
    } else {
      return undefined;
    }
  };

// Removes a 2FA challenge after successful completion or cancellation
//
// @param credentialToken {string}
// @param credentialSecret {string}
OAuth2FA._removePending2FACredential =
  async (credentialToken, credentialSecret = null) => {
    check(credentialToken, String);

    await OAuth2FA._pending2FACredentials.removeAsync({
      credentialToken,
      credentialSecret,
    });
  };



// Export for server-side usage
OAuth2FA._cleanStale2FAResults = _cleanStale2FAResults;
OAuth2FA._cleanup2FAHandle = _cleanup2FAHandle;

export { OAuth2FA };