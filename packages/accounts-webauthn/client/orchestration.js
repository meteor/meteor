import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { callMethod } from './util.js';
import { normalizeWebAuthnError } from './errors.js';

// Fetches ceremony options from the server and runs the browser ceremony.
async function runCeremony(optionsMethod, args, start) {
  if (!browserSupportsWebAuthn()) {
    throw new Meteor.Error(
      'webauthn-not-supported',
      'This browser does not support WebAuthn.'
    );
  }
  const optionsJSON = await callMethod(optionsMethod, args);
  try {
    return await start({ optionsJSON });
  } catch (error) {
    throw normalizeWebAuthnError(error);
  }
}

// Shared by primary login and the second-factor login variants.
export const requestAssertion = ({ selector, mode }) =>
  runCeremony(
    'generateWebAuthnAuthenticationOptions',
    { selector, mode },
    startAuthentication
  );

// Shared by registerWebAuthnCredential and createUserWithWebAuthn.
export const requestRegistration = ({ mode, name, userData }) =>
  runCeremony(
    'generateWebAuthnRegistrationOptions',
    { mode, name, userData },
    startRegistration
  );

export const callLoginMethod = (methodArguments, methodName = 'login') =>
  new Promise((resolve, reject) => {
    Accounts.callLoginMethod({
      methodName,
      methodArguments,
      userCallback: (error, loginDetails) =>
        error ? reject(error) : resolve(loginDetails),
    });
  });
