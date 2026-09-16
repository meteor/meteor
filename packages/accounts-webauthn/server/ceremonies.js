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

const malformed = () =>
  Accounts._handleError(
    'Malformed WebAuthn response',
    true,
    'invalid-webauthn-response'
  );

// The challenge a response answers is embedded in its client data. It is used
// only to look up the pending challenge; the library verifies it again.
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

// Authenticator data layout: rpIdHash (32) | flags (1) | signCount (4) | ...
function readAssertionCounter(response) {
  const raw = response?.response?.authenticatorData;
  if (typeof raw !== 'string' || !raw) {
    malformed();
  }
  const bytes = Buffer.from(raw, 'base64url');
  if (bytes.length < 37) {
    malformed();
  }
  return bytes.readUInt32BE(33);
}

// Looks up and consumes the challenge a response answers, checking that it was
// issued for the given ceremony and, when known, the given user.
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

// Runs a library verification, reporting exceptions and unverified results
// under one error code.
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

// Completes a registration ceremony for a new credential: consumes the
// challenge, verifies the response, runs the validation hooks and checks that
// the credential id is not registered yet. `userId` is null for sign-ups.
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
        requireUserVerification: config.userVerification === 'required',
      })
  );
  await runRegistrationValidation(registrationInfo, { userId, mode });
  await assertCredentialIdAvailable(registrationInfo.credential.id);
  return { challengeDoc, registrationInfo };
}

// Resolves the credential a response was signed with, verifies the assertion
// against its consumed challenge, and records the use. Shared by primary login
// and the second-factor check.
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
  if (detectCounterRollback(credential.counter, readAssertionCounter(response))) {
    Accounts._handleError(
      'WebAuthn signature counter did not increase; the authenticator may have been cloned',
      true,
      'webauthn-counter-mismatch'
    );
  }

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
        credential: toLibCredential(credential),
        requireUserVerification,
      })
  );
  await touchCredential(user._id, credential, authenticationInfo);
  return authenticationInfo;
}
