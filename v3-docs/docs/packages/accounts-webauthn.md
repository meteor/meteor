# accounts-webauthn

This package adds [WebAuthn](https://www.w3.org/TR/webauthn-3/) (FIDO2) authentication to Meteor accounts. Users can log in with a hardware security key, such as a YubiKey, or with a platform passkey, such as Touch ID, Windows Hello or an Android biometric prompt. It supports three flows:

- **Passwordless login.** A security key is the only credential the user needs. The account can be identified by the key itself (a discoverable credential, also called a passkey) or by a username or email typed first.
- **Sign-up with a security key.** A new account is created with a key as its only login method.
- **Second factor.** A user who logs in with [`accounts-password`](../api/accounts.md#passwords) or [`accounts-passwordless`](./accounts-passwordless.md) can require a security key in addition to the password or login token, in the same way [`accounts-2fa`](./accounts-2fa.md) requires an authenticator code.

The server side is built on [@simplewebauthn/server](https://simplewebauthn.dev/) and the client side on [@simplewebauthn/browser](https://simplewebauthn.dev/docs/packages/browser). Both are bundled by the package; the app does not have to install them.

::: warning Secure context required
Browsers only expose WebAuthn on `https://` origins and on `http://localhost`. The relying party id defaults to the hostname of `ROOT_URL`, so make sure `ROOT_URL` matches the address users open the app from.
:::

## Configuration {#configuration}

Everything works without configuration on a single-origin app. The options below can be passed to `Accounts.config({ webauthn: { ... } })` on the server, or set in `Meteor.settings.packages.accounts.webauthn`.

| Option | Default | Description |
| --- | --- | --- |
| `rpID` | hostname of `ROOT_URL` | The relying party id. Credentials are bound to it, so changing it invalidates every registered key. Use the registrable domain (`example.com`) to share keys between subdomains. |
| `rpName` | `Accounts.emailTemplates.siteName` or `rpID` | The name shown by the browser and the authenticator during registration. |
| `origins` | `[origin of ROOT_URL]` | The origins allowed to complete a ceremony. Add every origin the app is served from. |
| `attestationType` | `'none'` | `'none'`, `'direct'` or `'enterprise'`. `'direct'` and `'enterprise'` only ask the authenticator to convey an attestation statement. The reported authenticator model (AAGUID) is trustworthy only after that statement has been verified against a trust anchor, such as the FIDO Metadata Service; the validation hook receives the full verification result for that purpose. |
| `authenticatorAttachment` | unrestricted | `'cross-platform'` to only allow roaming keys such as USB or NFC devices, `'platform'` to only allow the built-in authenticator of the device. |
| `residentKey` | `'preferred'` | Whether registration asks for a discoverable credential. Discoverable credentials allow login without typing a username. |
| `userVerification` | `'required'` | User verification (PIN or biometrics on the key) asked for when registering a key. With `'required'`, the browser has the user set up a PIN on keys that have none. Passwordless login and sign-up always require it, whatever this setting: a key alone must never be enough to get in. A key registered without user verification is a second-factor-only key, which the passwordless login refuses with `webauthn-second-factor-only`. Set `'preferred'` for deployments that use keys mainly as a second factor and do not want to force a PIN on every key. |
| `secondFactorUserVerification` | `'preferred'` | User verification for second-factor use, where the password is the knowledge factor. |
| `timeout` | `60000` | Milliseconds a challenge stays valid, at most `600000` (ten minutes). |
| `requireTotpOnLogin` | `false` | Also require the [`accounts-2fa`](./accounts-2fa.md) authenticator code after a passwordless login. Requires the `accounts-2fa` package. |
| `passwordlessLogin` | `true` | Set to `false` to turn off passwordless login and key-only sign-up, for deployments that use keys purely as a second factor. The login options and the login handler then fail with `webauthn-passwordless-disabled`. |

```js
// server
Accounts.config({
  webauthn: {
    rpID: 'example.com',
    rpName: 'Example',
    origins: ['https://example.com', 'https://app.example.com'],
  },
});
```

## Registering a security key {#registering}

A logged-in user registers a key with `Accounts.registerWebAuthnCredential`. The whole ceremony, from fetching the challenge to storing the verified credential, happens inside the call.

<ApiBox name="Accounts.registerWebAuthnCredential" from="accounts-base"/>
<ApiBox name="Accounts.registerWebAuthnCredentialAsync" from="accounts-base"/>

```js
import { Accounts } from 'meteor/accounts-base';

async function addKey() {
  if (!Accounts.isWebAuthnSupported()) {
    return alert('This browser does not support security keys');
  }
  try {
    const credential = await Accounts.registerWebAuthnCredentialAsync('My YubiKey');
    console.log('registered', credential.id);
  } catch (error) {
    if (error.error === 'webauthn-not-allowed') {
      // the user cancelled the browser prompt
    }
  }
}
```

The credential is stored under `services.webauthn` on the user document, together with a stable random user handle that identifies the account to the authenticator:

```js
services: {
  webauthn: {
    userHandle: '***',
    secondFactorEnabled: false,
    credentials: [
      {
        id: '***',            // credential id, unique across all users
        publicKey: <binary>,  // never sent to the client
        counter: 0,
        transports: ['usb', 'nfc'],
        deviceType: 'singleDevice',
        backedUp: false,
        aaguid: '...',
        fmt: 'none',
        userVerified: true,
        name: 'My YubiKey',
        createdAt: Date,
        lastUsedAt: Date,
      },
    ],
  },
}
```

Feature detection helpers:

<ApiBox name="Accounts.isWebAuthnSupported" from="accounts-base"/>
<ApiBox name="Accounts.isWebAuthnPlatformAuthenticatorAvailable" from="accounts-base"/>

## Managing security keys {#managing}

<ApiBox name="Accounts.listWebAuthnCredentials" from="accounts-base"/>
<ApiBox name="Accounts.listWebAuthnCredentialsAsync" from="accounts-base"/>
<ApiBox name="Accounts.renameWebAuthnCredential" from="accounts-base"/>
<ApiBox name="Accounts.renameWebAuthnCredentialAsync" from="accounts-base"/>
<ApiBox name="Accounts.removeWebAuthnCredential" from="accounts-base"/>
<ApiBox name="Accounts.removeWebAuthnCredentialAsync" from="accounts-base"/>

Removing the last key fails with the `webauthn-last-credential` error when the account has no password, no email address usable with `accounts-passwordless`, and no external login service. Removing the last key also turns the second-factor requirement off.

## Auditing key changes {#auditing}

<ApiBox name="Accounts.onWebAuthnCredentialChange" from="accounts-base"/>

Security keys are worth an audit trail and a notification email. The callback runs after the change is stored, for keys added while logged in, keys registered during sign-up, renames and removals:

```js
// server
Accounts.onWebAuthnCredentialChange(async ({ userId, action, credential }) => {
  await AuditLog.insertAsync({ userId, action: `webauthn-${action}`, credential, at: new Date() });
  if (action === 'added') {
    await sendSecurityKeyAddedEmail(userId, credential.name);
  }
});
```

## Passwordless login {#login}

<ApiBox name="Meteor.loginWithWebAuthn"/>
<ApiBox name="Meteor.loginWithWebAuthnAsync"/>

Without a selector, the browser asks the authenticator for a discoverable credential and the account is identified by the key. This is the passkey experience: one button, no username field.

```js
<button onClick={() => Meteor.loginWithWebAuthn(error => {
  if (error) console.error('Login failed', error);
})}>
  Sign in with a security key
</button>
```

With a selector, the server lists the keys registered for that account so any key, discoverable or not, can be used:

```js
await Meteor.loginWithWebAuthnAsync({ email });
```

Passwordless login always requires user verification, and a key registered without it (see `userVerification`) is refused with `webauthn-second-factor-only`. Users who enabled the [`accounts-2fa`](./accounts-2fa.md) authenticator code are not asked for it after a passwordless login unless `requireTotpOnLogin` is set, in which case the login fails with `no-2fa-code` and the code can be passed by calling `Accounts.callLoginMethod` with `{ webauthn, code }`.

## Sign-up with a security key {#signup}

<ApiBox name="Accounts.createUserWithWebAuthn" from="accounts-base"/>
<ApiBox name="Accounts.createUserWithWebAuthnAsync" from="accounts-base"/>

The user is logged in as soon as the key is registered. `Accounts.onCreateUser`, `Accounts.validateNewUser`, `forbidClientAccountCreation` and `restrictCreationByEmailDomain` apply as they do for `Accounts.createUser`.

```js
await Accounts.createUserWithWebAuthnAsync({
  email,
  profile: { name },
  credentialName: 'Laptop',
});
```

An account created this way requires its key at every login, as if `Accounts.enableWebAuthnSecondFactor` had been called. If a password is set later, for example through a reset link when `accounts-password` is installed, password login still asks for the key and the reset link alone does not log the user in. Call `Accounts.disableWebAuthnSecondFactor` to lift that requirement.

## Security key as a second factor {#second-factor}

A user with at least one registered key can require it whenever they log in with a password or a login token:

<ApiBox name="Accounts.enableWebAuthnSecondFactor" from="accounts-base"/>
<ApiBox name="Accounts.enableWebAuthnSecondFactorAsync" from="accounts-base"/>
<ApiBox name="Accounts.disableWebAuthnSecondFactor" from="accounts-base"/>
<ApiBox name="Accounts.disableWebAuthnSecondFactorAsync" from="accounts-base"/>
<ApiBox name="Accounts.hasWebAuthnSecondFactorEnabled" from="accounts-base"/>
<ApiBox name="Accounts.hasWebAuthnSecondFactorEnabledAsync" from="accounts-base"/>

Once enabled, `Meteor.loginWithPassword` fails with the `no-webauthn-assertion` error when the security key is the only second factor the user has enabled, exactly as it fails with `no-2fa-code` for `accounts-2fa`. A user who has enabled both gets `second-factor-required` instead, and either factor completes the login (see the section on combining factors below). Call the WebAuthn variant to complete the login:

<ApiBox name="Meteor.loginWithPasswordAndWebAuthn"/>
<ApiBox name="Meteor.loginWithPasswordAndWebAuthnAsync"/>
<ApiBox name="Meteor.passwordlessLoginWithTokenAndWebAuthn"/>
<ApiBox name="Meteor.passwordlessLoginWithTokenAndWebAuthnAsync"/>

```js
try {
  await Meteor.loginWithPasswordAsync(email, password);
} catch (error) {
  if (error.error === 'no-webauthn-assertion') {
    await Meteor.loginWithPasswordAndWebAuthnAsync(email, password);
  } else {
    throw error;
  }
}
```

### Combining with accounts-2fa {#with-2fa}

A user may enable both an authenticator code and a security key. Any one of the enabled factors completes the login, so a lost key never locks a user out who still has their authenticator app. When neither answer is supplied, the login fails with the `second-factor-required` error and `error.details.availableFactors` lists the enabled factors, for example `['totp', 'webauthn']`. The single-factor errors `no-2fa-code` and `no-webauthn-assertion` carry the same `details.availableFactors` field, so a login form can always branch on it:

```js
try {
  await Meteor.loginWithPasswordAsync(email, password);
} catch (error) {
  const factors = error.details?.availableFactors || [];
  if (factors.includes('webauthn')) showSecurityKeyButton();
  if (factors.includes('totp')) showCodeInput();
}
```

## Validating registrations on the server {#validating}

<ApiBox name="Accounts.validateWebAuthnRegistration" from="accounts-base"/>

```js
// server
Accounts.config({ webauthn: { attestationType: 'direct' } });

const ALLOWED_AAGUIDS = new Set(['2fc0579f-8113-47ea-b116-bb5a8db9202a']);

Accounts.validateWebAuthnRegistration((info, context, registrationInfo) => {
  if (context.mode === 'signup' && !info.userVerified) {
    throw new Meteor.Error('pin-required', 'Set a PIN on your key first');
  }
  // Trust info.aaguid only after verifying the attestation statement in
  // registrationInfo against a trust anchor such as the FIDO Metadata Service.
  return ALLOWED_AAGUIDS.has(info.aaguid);
});
```

## Errors {#errors}

| Code | Meaning |
| --- | --- |
| `webauthn-not-supported` | The browser has no WebAuthn support. |
| `webauthn-not-allowed` | The user cancelled the browser prompt, it timed out, or the key refused. |
| `webauthn-ceremony-aborted` | The ceremony was aborted by another one starting. |
| `webauthn-user-verification-unsupported` | The key cannot verify the user (no PIN or biometrics) but verification was required. |
| `webauthn-discoverable-credential-unsupported` | The key cannot store a discoverable credential but one was required. |
| `webauthn-invalid-domain` | The page origin does not match `rpID`. |
| `webauthn-ceremony-failed` | Any other browser-side failure; `error.details.name` holds the DOM exception name. |
| `webauthn-challenge-invalid` | The challenge expired, was already used, or was issued for another ceremony or, for a second factor, for another user. |
| `invalid-webauthn-registration` | The registration response failed verification. |
| `invalid-webauthn-assertion` | The passwordless login failed: unknown key, wrong origin, bad signature, missing user verification, or a challenge issued for another user. Every case shares this code, so a forged response cannot tell registered keys from unknown ones. |
| `invalid-webauthn-credential` | During second-factor verification, the key is not registered to this account. |
| `webauthn-second-factor-only` | The key was registered without user verification and can only be used as a second factor. |
| `webauthn-passwordless-disabled` | `passwordlessLogin` is off; keys can only be used as a second factor. |
| `webauthn-counter-mismatch` | The signature counter did not increase. The key may have been cloned. |
| `webauthn-credential-in-use` | The key is already registered, to this or another account. |
| `webauthn-registration-rejected` | An `Accounts.validateWebAuthnRegistration` callback rejected the key. |
| `webauthn-last-credential` | The last key cannot be removed from an account with no other login method. |
| `webauthn-credential-not-found` | No key with that id belongs to the logged-in user. |
| `no-webauthn-credential` | The second factor cannot be enabled before a key is registered. |
| `no-webauthn-assertion` | A password or token login needs a security key; call the WebAuthn login variant. |
| `second-factor-required` | More than one second factor is enabled; see `details.availableFactors`. |

Server-side failures go through the accounts `ambiguousErrorMessages` setting: with the default of `true`, the `reason` is generic but the `error` code is preserved.

## Extending second factors {#extending}

`accounts-2fa` and this package both register themselves through `Accounts.registerSecondFactor`, which `accounts-password` and `accounts-passwordless` consult after verifying the primary credential. Other packages can add their own factors the same way.

<ApiBox name="Accounts.registerSecondFactor" from="accounts-base"/>
