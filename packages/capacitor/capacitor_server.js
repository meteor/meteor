/**
 * @module capacitor_server
 * @description Server-side runtime for the capacitor package.
 */

import { Meteor } from 'meteor/meteor';
import { WebApp, WebAppInternals } from 'meteor/webapp';
import {
  CORDOVA_JS_STUB,
  WEB_APP_LOCAL_SERVER_SHIM,
} from './lib/constants.js';

Meteor.isCapacitor = false;

const BOILERPLATE_CALLBACK_KEY = 'meteor:capacitor:webapp-local-server-shim';
const CLIENT_ARCH_DETECTOR_KEY = 'meteor:capacitor:client-arch-detector';
const CAPACITOR_LIVERELOAD_USER_AGENT = 'MeteorCapacitorLivereload';

export function isCapacitorDirectServerMode(env = process.env) {
  return env.METEOR_CAPACITOR === 'true' &&
    env.METEOR_CAPACITOR_MODE === 'livereload';
}

export function getCapacitorLivereloadUserAgentToken() {
  return CAPACITOR_LIVERELOAD_USER_AGENT;
}

export function isCapacitorLivereloadRequest(req, env = process.env) {
  if (!isCapacitorDirectServerMode(env)) {
    return false;
  }

  return String(req?.headers?.['user-agent'] || '')
    .includes(getCapacitorLivereloadUserAgentToken());
}

export function detectCapacitorClientArch(req, _categorized, options = {}) {
  const env = options.env || process.env;
  if (!isCapacitorLivereloadRequest(req, env)) {
    return null;
  }

  return 'web.cordova';
}

export function getCordovaJsStub(env = process.env) {
  return isCapacitorDirectServerMode(env) ? CORDOVA_JS_STUB : null;
}

export function injectWebAppLocalServerShim(_request, data, arch, _response, options = {}) {
  if (arch !== 'web.cordova') {
    return false;
  }

  const env = options.env || process.env;
  if (!isCapacitorDirectServerMode(env)) {
    return false;
  }

  const head = data.head || '';
  if (head.includes('var WebAppLocalServer')) {
    return false;
  }

  data.head = `${WEB_APP_LOCAL_SERVER_SHIM}${head}`;
  return true;
}

WebAppInternals.registerBoilerplateDataCallback(
  BOILERPLATE_CALLBACK_KEY,
  injectWebAppLocalServerShim
);
WebAppInternals.registerClientArchDetector(
  CLIENT_ARCH_DETECTOR_KEY,
  detectCapacitorClientArch
);

WebApp.rawConnectHandlers.use('/cordova.js', (req, res, next) => {
  const stub = getCordovaJsStub();
  if (!stub) {
    next();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(stub);
});
