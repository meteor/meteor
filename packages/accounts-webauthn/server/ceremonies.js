import { Accounts } from 'meteor/accounts-base';
import { Match } from 'meteor/check';
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { getWebAuthnConfig } from './config.js';
import { consumeChallenge } from './collection.js';
import {
  detectCounterRollback,
  findCredential,
  toLibCredential,
  touchCredential,
  assertCredentialIdAvailable,
} from './credential_store.js';
import { runRegistrationValidation } from './hooks.js';

// Shape of the JSON returned by startRegistration() in the browser.
export const registrationResponsePattern = Match.ObjectIncluding({
  id: Match.NonEmptyString,
  rawId: Match.NonEmptyString,
  type: 'public-key',
  response: Match.ObjectIncluding({
    clientDataJSON: Match.NonEmptyString,
    attestationObject: Match.NonEmptyString,
  }),
});

// Shape of the JSON returned by startAuthentication() in the browser.
export const assertionResponsePattern = Match.ObjectIncluding({
  id: Match.NonEmptyString,
  rawId: Match.NonEmptyString,
  type: 'public-key',
  response: Match.ObjectIncluding({
    clientDataJSON: Match.NonEmptyString,
    authenticatorData: Match.NonEmptyString,
    signature: Match.NonEmptyString,
    userHandle: Match.Maybe(String),
  }),
});

/**
 * Throws the error for a response that cannot be parsed.
 * @throws {Meteor.Error} `invalid-webauthn-response`
 */
const malformed = () =>
  Accounts._handleError(
    'Malformed WebAuthn response',
    true,
    'invalid-webauthn-response'
  );

/**
 * Reads the challenge a response answers from its client data. It is used only
 * to look up the pending challenge; the library verifies it again.
 * @param {Object} response The registration or authentication response JSON.
 * @returns {String} The base64url challenge.
 * @throws {Meteor.Error} `invalid-webauthn-response` when the client data cannot be parsed.
 */
function decodeClientDataChallenge(response) {
  const clientDataJSON = response?.response?.clientDataJSON;
  if (typeof clientDataJSON !== 'string' || !clientDataJSON) {
    malformed();
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
  } catch (error) {
    malformed();
  }
  if (typeof parsed?.challenge !== 'string' || !parsed.challenge) {
    malformed();
  }
  return parsed.challenge;
}

/**
 * Looks up and consumes the challenge a response answers, checking that it was
 * issued for the given ceremony and, when known, the given user.
 * @param {Object} response The registration or authentication response JSON.
 * @param {Object} options
 * @param {String} options.type `registration` or `authentication`.
 * @param {String} options.mode The ceremony mode the challenge was issued for.
 * @param {String} [options.expectedUserId] The user the challenge must belong to; `null` for sign-ups.
 * @returns {Promise<Object>} The consumed challenge document.
 * @throws {Meteor.Error} `webauthn-challenge-invalid` when the challenge is unknown, expired, used, or bound to another user.
 */
export async function consumeChallengeForResponse(
  response,
  { type, mode, expectedUserId }
) {
  const challenge = decodeClientDataChallenge(response);
  const doc = await consumeChallenge(challenge, { type, mode });
  if (!doc) {
    Accounts._handleError(
      'WebAuthn challenge is invalid, expired, or already used',
      true,
      'webauthn-challenge-invalid'
    );
  }
  if (expectedUserId !== undefined && doc.userId !== expectedUserId) {
    Accounts._handleError(
      'WebAuthn challenge was issued for a different user',
      true,
      'webauthn-challenge-invalid'
    );
  }
  return doc;
}

/**
 * Runs a library verification, reporting exceptions and unverified results
 * under one error code.
 * @param {String} code The error code to throw with.
 * @param {String} label The error message.
 * @param {Function} verify Returns the library's verification promise.
 * @returns {Promise<Object>} The verified result.
 * @throws {Meteor.Error} `code` when the verification throws or does not verify.
 */
async function verifyOrThrow(code, label, verify) {
  let result;
  try {
    result = await verify();
  } catch (error) {
    Accounts._handleError(`${label}: ${error.message}`, true, code);
  }
  if (!result.verified) {
    Accounts._handleError(label, true, code);
  }
  return result;
}

/**
 * Completes a registration ceremony for a new credential: consumes the
 * challenge, verifies the response, runs the validation hooks and checks that
 * the credential id is not registered yet. Sign-ups always require user
 * verification, since the new key is the only way into the account.
 * @param {Object} options
 * @param {Object} options.credential The registration response JSON.
 * @param {String} options.mode `addCredential` or `signup`.
 * @param {String} [options.userId] The registering user; `null` for sign-ups.
 * @returns {Promise<Object>} `{ challengeDoc, registrationInfo }`.
 */
export async function verifyNewCredential({ credential, mode, userId = null }) {
  const config = getWebAuthnConfig();
  const challengeDoc = await consumeChallengeForResponse(credential, {
    type: 'registration',
    mode,
    expectedUserId: userId,
  });
  const { registrationInfo } = await verifyOrThrow(
    'invalid-webauthn-registration',
    'WebAuthn registration could not be verified',
    () =>
      verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeDoc._id,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification:
          mode === 'signup' || config.userVerification === 'required',
      })
  );
  await runRegistrationValidation(registrationInfo, { userId, mode });
  await assertCredentialIdAvailable(registrationInfo.credential.id);
  return { challengeDoc, registrationInfo };
}

/**
 * Resolves the credential a response was signed with, verifies the assertion
 * against its consumed challenge, and records the use. Shared by primary login
 * and the second-factor check.
 * @param {Object} options
 * @param {Object} options.user The user document, including `services.webauthn`.
 * @param {Object} options.response The authentication response JSON.
 * @param {Object} options.challengeDoc The consumed challenge document.
 * @param {Boolean} options.requireUserVerification Whether the authenticator must have verified the user.
 * @returns {Promise<Object>} `{ credential, authenticationInfo }`: the stored credential and the library's result.
 */
export async function authenticateCredential({
  user,
  response,
  challengeDoc,
  requireUserVerification,
}) {
  const credential = findCredential(user, response.id);
  if (!credential) {
    Accounts._handleError(
      'Security key does not belong to this account',
      true,
      'invalid-webauthn-credential'
    );
  }

  // The signature is verified before anything that depends on the stored
  // credential, so a forged assertion learns nothing about it. The library
  // checks the counter before the signature, so its check is disabled with a
  // zero counter and the rollback check runs on the verified assertion.
  const config = getWebAuthnConfig();
  const { authenticationInfo } = await verifyOrThrow(
    'invalid-webauthn-assertion',
    'WebAuthn assertion could not be verified',
    () =>
      verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeDoc._id,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        credential: { ...toLibCredential(credential), counter: 0 },
        requireUserVerification,
      })
  );
  if (detectCounterRollback(credential.counter, authenticationInfo.newCounter)) {
    Accounts._handleError(
      'WebAuthn signature counter did not increase; the authenticator may have been cloned',
      true,
      'webauthn-counter-mismatch'
    );
  }
  await touchCredential(user._id, credential, authenticationInfo);
  return { credential, authenticationInfo };
}
