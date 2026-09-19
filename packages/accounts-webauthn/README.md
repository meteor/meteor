# accounts-webauthn

[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/accounts-webauthn)
| [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/accounts-webauthn)
***

A package that adds WebAuthn (FIDO2) authentication to Meteor accounts: hardware
security keys and platform passkeys can be used as a passwordless login method,
to sign up without a password, or as a second factor for `accounts-password`
and `accounts-passwordless` logins. Check the
[docs](https://docs.meteor.com/packages/accounts-webauthn.html) for the full API.

## For maintainers

The package relies on `@simplewebauthn/server` and `@simplewebauthn/browser`,
pinned in `package.js`. When bumping them, check these touchpoints.

**Server** (`server/methods.js`, `server/ceremonies.js`)

- `generateRegistrationOptions({ rpName, rpID, userName, userID, userDisplayName, attestationType, excludeCredentials, authenticatorSelection, timeout })`:
  the result's `challenge`, `user.id` and `authenticatorSelection` are used.
- `verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID, requireUserVerification })`:
  `verified` and `registrationInfo.credential.{id, publicKey, counter, transports}`,
  `credentialDeviceType`, `credentialBackedUp`, `aaguid`, `fmt` and `userVerified`
  are read. With `attestationType: 'none'` the library verifies no signature, so a
  registration can claim any credential id; that is why `assertCredentialIdAvailable`
  refuses decoy ids (`server/decoys.js`).
- `generateAuthenticationOptions({ rpID, allowCredentials, userVerification, timeout })`:
  `challenge` is stored; `allowCredentials` entries are `{ id, transports }`.
- `verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID, credential, requireUserVerification })`:
  `verified` and `authenticationInfo.{newCounter, credentialBackedUp}` are read. The
  library checks the signature counter before the signature, so
  `authenticateCredential` passes `counter: 0` to disable that check and runs
  `detectCounterRollback` on the verified result. If a release reorders those
  checks, a rollback fails with `invalid-webauthn-assertion` instead of
  `webauthn-counter-mismatch`, which the tests will show.

**Client** (`client/orchestration.js`, `client/feature_detection.js`, `client/errors.js`)

- `startRegistration({ optionsJSON })`, `startAuthentication({ optionsJSON })`,
  `browserSupportsWebAuthn()` and `platformAuthenticatorIsAvailable()`.
- `WebAuthnError.code` values mapped in `client/errors.js`: `ERROR_CEREMONY_ABORTED`,
  `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`,
  `ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT`,
  `ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT`,
  `ERROR_INVALID_DOMAIN` and `ERROR_INVALID_RP_ID`.

After a bump, run `meteor test-packages accounts-webauthn`. The tests named
`accounts-webauthn - invariants - ...` guard the security properties that are
not obvious from the code: signature-first verification, one failure code on
the passwordless path, decoy credential lists and tagged decoy ids, challenges
bound to their selector and used once, user verification for passwordless
login and sign-up, and the last-key rule. Keep them passing before changing
anything they cover.
