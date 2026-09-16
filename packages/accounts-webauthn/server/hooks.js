import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

const registrationValidators = [];
const changeListeners = [];

const addListener = (listeners, func) => {
  listeners.push(func);
  return {
    stop: () => {
      const index = listeners.indexOf(func);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    },
  };
};

/**
 * @summary Register a callback that validates a WebAuthn registration before
 * the credential is stored. Use it to allow only certain authenticator models
 * (by AAGUID) or to require backed-up passkeys, for example. Set
 * `attestationType` to `direct` or `enterprise` for the AAGUID to be
 * trustworthy.
 * @locus Server
 * @param {Function} func Called with `info` (`{ credentialId, aaguid, fmt,
 * deviceType, backedUp, userVerified, transports }`), `context`
 * (`{ userId, mode }` where `mode` is `addCredential` or `signup`) and the
 * full verification result from `@simplewebauthn/server`. Return `false` or
 * throw to reject the registration. May return a promise.
 * @returns {Object} An object with a `stop` function that removes the callback.
 * @importFromPackage accounts-base
 */
Accounts.validateWebAuthnRegistration = func =>
  addListener(registrationValidators, func);

/**
 * @summary Register a callback that runs after a security key was added,
 * renamed or removed, for audit logs or "a new key was added" notifications.
 * @locus Server
 * @param {Function} func Called with `{ userId, action, credential }`, where
 * `action` is `added`, `renamed` or `removed` and `credential` describes the
 * key (`id`, `name`, `transports`, `deviceType`, `backedUp`, `aaguid`,
 * `createdAt`, `lastUsedAt`). May return a promise. The change has already
 * been stored: an exception is logged and does not undo it.
 * @returns {Object} An object with a `stop` function that removes the callback.
 * @importFromPackage accounts-base
 */
Accounts.onWebAuthnCredentialChange = func => addListener(changeListeners, func);

export async function runRegistrationValidation(registrationInfo, context) {
  const info = {
    credentialId: registrationInfo.credential.id,
    aaguid: registrationInfo.aaguid,
    fmt: registrationInfo.fmt,
    deviceType: registrationInfo.credentialDeviceType,
    backedUp: registrationInfo.credentialBackedUp,
    userVerified: registrationInfo.userVerified,
    transports: registrationInfo.credential.transports || [],
  };
  for (const validate of registrationValidators) {
    if ((await validate(info, context, registrationInfo)) === false) {
      Accounts._handleError(
        'WebAuthn registration rejected',
        true,
        'webauthn-registration-rejected'
      );
    }
  }
}

export async function notifyCredentialChange(change) {
  for (const listener of changeListeners) {
    try {
      await listener(change);
    } catch (error) {
      Meteor._debug(
        'accounts-webauthn: onWebAuthnCredentialChange callback failed',
        error
      );
    }
  }
}
