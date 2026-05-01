import _ from 'underscore';
import { timeoutScaleFactor } from '../utils/utils.js';
import { fail, markStack } from './selftest.js';
import { request } from '../utils/http-helpers.js';
import { networkInterfaces } from 'os';

export function randomString(charsCount) {
  var chars = 'abcdefghijklmnopqrstuvwxyz';
  var str = '';
  for (var i = 0; i < charsCount; i++) {
    str = str + chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

export const accountsCommandTimeoutSecs = 15 * timeoutScaleFactor;

export function randomAppName() {
  return 'selftest-app-' + randomString(10);
}

export function randomUserEmail() {
  return 'selftest-user-' + randomString(15) + '@guerrillamail.com';
}

export async function login(s, username, password) {
  var run = s.run('login');
  run.waitSecs(15);
  await run.matchErr('Username:');
  run.write(username + '\n');
  await run.matchErr('Password:');
  run.write(password + '\n');
  run.waitSecs(15);
  await run.matchErr('Logged in as ' + username + ".");
  await run.expectExit(0);
}

export async function logout(s) {
  var run = s.run('logout');
  run.waitSecs(15);
  await run.matchErr('Logged out');
  await run.expectExit(0);
}

export const registrationUrlRegexp =
  /https:\/\/www\.meteor\.com\/setPassword\?([a-zA-Z0-9\+\/]+)/;
export function randomOrgName() {
  return "selftestorg" + exports.randomString(10);
}

export function getMeteorRuntimeConfigFromHTML(html) {
  var m = html.match(/__meteor_runtime_config__ = JSON.parse\(decodeURIComponent\("([^"]+?)"\)\)/);
  if (! m) {
    fail("Can't find __meteor_runtime_config__");
  }
  return JSON.parse(decodeURIComponent(m[1]));
}

// Poll the given app looking for the correct settings. Throws an error
// if the settings aren't found after a timeout.
export const checkForSettings = markStack(async function (appName, settings, timeoutSecs) {
  var timeoutDate = new Date(new Date().valueOf() + timeoutSecs * 1000);
  while (true) {
    if (new Date() >= timeoutDate) {
      fail('Expected settings not found on app ' + appName);
    }

    var result = await request('http://' + appName);

    // XXX This is brittle; the test will break if we start formatting the
    // __meteor_runtime_config__ JS differently. Ideally we'd do something
    // like point a headless browser at the deployed app and actually
    // evaluate Meteor.settings.
    try {
      var mrc = exports.getMeteorRuntimeConfigFromHTML(result.body);
    } catch (e) {
      // ignore
      continue;
    }

    if (_.isEqual(mrc.PUBLIC_SETTINGS, settings['public'])) {
      return;
    }
  }
});

export function markThrowingMethods(prototype) {
  Object.keys(prototype).forEach(key => {
    const value = prototype[key];
    if (typeof value === "function") {
      const code = Function.prototype.toString.call(value);
      if (/\bnew TestFailure\b/.test(code)) {
        prototype[key] = markStack(value);
      }
    }
  });
}

export function getPrivateIPAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    if (name.startsWith('br')) continue;
    for (const net of nets[name]) {
      if (net.family === 4 && !net.internal) {
        return net.address;
      }
    }
  }
  return "";
}