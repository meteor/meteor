import { Accounts } from 'meteor/accounts-base';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';

/**
 * @summary Whether the current browser supports WebAuthn.
 * @locus Client
 * @returns {Boolean}
 * @importFromPackage accounts-base
 */
Accounts.isWebAuthnSupported = () => browserSupportsWebAuthn();

/**
 * @summary Whether a platform authenticator (Touch ID, Windows Hello, Android
 * biometrics, ...) is available on this device.
 * @locus Client
 * @returns {Promise<Boolean>}
 * @importFromPackage accounts-base
 */
Accounts.isWebAuthnPlatformAuthenticatorAvailable = () =>
  platformAuthenticatorIsAvailable();
