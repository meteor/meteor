import path from 'path';
import fs from 'fs-extra';

import {
  setupMeteorApp,
  runMeteorApp,
  killMeteorProcess,
  killProcessByPort,
  cleanupTempDir,
  wait,
  waitForMeteorOutput,
} from '../helpers';

export const APP_NAME = 'accounts';

export async function startAccountsApp({ port, settingsFile }) {
  await killProcessByPort(port);
  const { tempDir } = await setupMeteorApp(APP_NAME);

  const settingsPath = settingsFile
    ? path.join(tempDir, settingsFile)
    : path.join(tempDir, 'settings-localstorage.json');

  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Settings file not found: ${settingsPath}`);
  }

  const { meteorProcess, outputLines } = await runMeteorApp(tempDir, port, {
    waitForOutput: /accounts e2e app: ready/,
    commandOptions: ['--settings', settingsPath],
  });

  return { tempDir, meteorProcess, outputLines };
}

export async function stopAccountsApp({ tempDir, meteorProcess, port }) {
  if (meteorProcess) await killMeteorProcess(meteorProcess);
  if (port) await killProcessByPort(port);
  if (tempDir) await cleanupTempDir(tempDir);
}

export async function openHarness(page, port) {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(
    () => window.__accountsE2E && typeof window.__accountsE2E.whoAmI === 'function',
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => Meteor.status().status === 'connected',
    { timeout: 30_000 },
  );
}

export async function callMethod(page, name, ...args) {
  return page.evaluate(
    ({ name, args }) => window.__accountsE2E.callMethod(name, ...args),
    { name, args },
  );
}

export async function resetServerState(page) {
  return callMethod(page, '_e2e.resetAll');
}

export async function applyConfig(page, options) {
  return callMethod(page, '_e2e.applyConfig', options);
}

export async function seedUser(page, opts) {
  return callMethod(page, '_e2e.createUser', opts);
}

export async function getUser(page, userId) {
  return callMethod(page, '_e2e.getUser', userId);
}

export async function lastEmail(page, to, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (true) {
    const email = await callMethod(page, '_e2e.lastEmail', { to });
    if (email) return email;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`No email captured for ${to} within ${timeoutMs}ms`);
    }
    await wait(intervalMs);
  }
}

export function extractTokenFromEmail(email) {
  if (!email) return null;
  const haystack = `${email.text || ''}\n${email.html || ''}`;
  const m = haystack.match(/(?:reset-password|enroll-account|verify-email)\/([A-Za-z0-9._\-]+)/);
  if (m) return m[1];
  const m2 = haystack.match(/loginToken=([A-Za-z0-9._\-]+)/);
  if (m2) return m2[1];
  return null;
}

export function extractUrlFromEmail(email) {
  if (!email) return null;
  const haystack = `${email.text || ''}\n${email.html || ''}`;
  const m = haystack.match(/https?:\/\/[^\s"<>]+/);
  return m ? m[0] : null;
}

export async function login(page, selector, password) {
  return page.evaluate(
    ({ selector, password }) => window.__accountsE2E.loginWithPassword(selector, password),
    { selector, password },
  );
}

export async function logout(page) {
  return page.evaluate(() => window.__accountsE2E.logout());
}

export async function expectLoggedIn(page, expectedUserId) {
  const state = await page.evaluate(() => window.__accountsE2E.whoAmI());
  if (!state.userId) {
    throw new Error(`expected logged in, got userId=${state.userId}`);
  }
  if (expectedUserId && state.userId !== expectedUserId) {
    throw new Error(`expected userId=${expectedUserId}, got ${state.userId}`);
  }
  return state;
}

export async function expectLoggedOut(page) {
  const state = await page.evaluate(() => window.__accountsE2E.whoAmI());
  if (state.userId) {
    throw new Error(`expected logged out, got userId=${state.userId}`);
  }
  return state;
}

export async function readLocalStorageToken(page) {
  return page.evaluate(() => ({
    token: window.__accountsE2E.storedToken(),
    expires: window.__accountsE2E.storedTokenExpires(),
    userId: window.__accountsE2E.storedUserId(),
  }));
}

export async function readCookie(page, name = 'meteor_login_token') {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === name) || null;
}

export async function visitLink(page, port, url) {
  if (/^https?:\/\//.test(url)) {
    await page.goto(url);
  } else {
    await page.goto(`http://localhost:${port}/${url.replace(/^\//, '')}`);
  }
  await page.waitForFunction(
    () => window.__accountsE2E && typeof window.__accountsE2E.whoAmI === 'function',
    { timeout: 30_000 },
  );
}

export async function getCallbacks(page) {
  return page.evaluate(() => window.__accountsE2E.callbacks());
}

export async function resetCallbacks(page) {
  return page.evaluate(() => window.__accountsE2E.resetCallbacks());
}

export async function fetchJson(page, urlPath, init = {}) {
  return page.evaluate(
    async ({ urlPath, init }) => {
      const res = await fetch(urlPath, init);
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: res.status, body };
    },
    { urlPath, init },
  );
}

export { waitForMeteorOutput };
