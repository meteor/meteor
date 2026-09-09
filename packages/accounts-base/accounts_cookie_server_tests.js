if (Meteor.isServer) {
  const COOKIE_NAME = 'meteor_login_token';
  const BASE_PATH = '/_accounts/cookie';
  const REFRESH_PATH = `${BASE_PATH}/refresh`;
  const SET_PATH = `${BASE_PATH}/set`;
  const CLEAR_PATH = `${BASE_PATH}/clear`;
  const EXPIRED_RE = /Expires=Thu, 01 Jan 1970|Expires=Wed, 31 Dec 1969|1970 GMT/;

  const internals = Accounts._httpOnlyCookieInternals;
  const appOrigin = () => new URL(Meteor.absoluteUrl()).origin;

  // Headers a browser sends on a legitimate same-origin request from the app.
  const sameOrigin = (extra = {}) => ({ Origin: appOrigin(), ...extra });
  const jsonSameOrigin = (extra = {}) =>
    sameOrigin({ 'Content-Type': 'application/json', ...extra });

  // Utility: simple HTTP request using Node's http/https depending on absoluteUrl
  const request = async (method, path, { headers, body, host } = {}) => {
    const url = Meteor.absoluteUrl(path.replace(/^\//, ''));
    const { URL } = Npm.require('url');
    const u = new URL(url);
    const opts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + (u.search || ''),
      method,
      headers: { ...headers, ...(host ? { Host: host } : {}) },
    };
    const httpLib = Npm.require(u.protocol === 'https:' ? 'https' : 'http');
    return new Promise((resolve, reject) => {
      const req = httpLib.request(opts, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json;
          try {
            json = data ? JSON.parse(data) : undefined;
          } catch {
            // not JSON
          }
          resolve({ status: res.statusCode, headers: res.headers, body: data, json });
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  };

  const setCookieHeader = (res) => res.headers['set-cookie'] && res.headers['set-cookie'][0];
  // When the cookie dispatcher declines a request it calls next(); WebApp then
  // answers a declared network route with 404 (GET) or 405 (other methods).
  const isUnhandled = (res) => res.status === 404 || res.status === 405;
  const cookiePair = (res) => setCookieHeader(res).split(';')[0];

  const createToken = async ({ expired = false } = {}) => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    if (expired) {
      const lifetimeMs = Accounts._getTokenLifetimeMs
        ? Accounts._getTokenLifetimeMs()
        : 90 * 24 * 60 * 60 * 1000;
      stamped.when = new Date(Date.now() - lifetimeMs - 1000);
    }
    await Accounts._insertLoginToken(userId, stamped);
    return { userId, token: stamped.token };
  };

  const setCookie = (token, headers = jsonSameOrigin()) =>
    request('POST', SET_PATH, { headers, body: JSON.stringify({ token }) });

  // Temporarily override an Accounts option for the duration of fn.
  const withOption = async (key, value, fn) => {
    const had = Object.prototype.hasOwnProperty.call(Accounts._options, key);
    const previous = Accounts._options[key];
    Accounts._options[key] = value;
    try {
      await fn();
    } finally {
      if (had) Accounts._options[key] = previous;
      else delete Accounts._options[key];
    }
  };

  // Every test starts with a clean rate-limit window so tests never throttle
  // each other. The feature itself is enabled in accounts_tests_setup.js.
  const addTest = (name, fn) =>
    Tinytest.addAsync(`accounts cookie - ${name}`, async (test) => {
      internals.resetRateLimit();
      await fn(test);
    });

  ///
  /// POST /set — happy path
  ///

  addTest('set writes an HttpOnly, SameSite=Strict cookie for a valid token', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token);
    test.equal(res.status, 200);
    test.equal(res.json && res.json.ok, true);
    const cookie = setCookieHeader(res);
    test.isTrue(new RegExp(`^${COOKIE_NAME}=`).test(cookie), 'cookie name');
    test.isTrue(/HttpOnly/i.test(cookie), 'HttpOnly flag');
    test.isTrue(/SameSite=Strict/i.test(cookie), 'SameSite=Strict');
    test.isTrue(/Path=\//.test(cookie), 'Path=/ present');
    test.isFalse(/Domain=/.test(cookie), 'no Domain attribute by default');
    test.isTrue(/Expires=/.test(cookie), 'Expires derived from the token');
    test.equal(res.headers['cache-control'], 'no-store');
  });

  addTest('set accepts Sec-Fetch-Site: same-origin without an Origin header', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token, {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
    });
    test.equal(res.status, 200);
    test.isTrue(!!setCookieHeader(res));
  });

  addTest('set accepts an Origin that matches the request Host', async (test) => {
    const { token } = await createToken();
    // Neither ROOT_URL nor an allow-list entry, but the browser addressed us as
    // this host, so a page served from it is same-origin.
    const headers = { 'Content-Type': 'application/json', Origin: 'http://app.internal.test:8080' };
    const mismatch = await setCookie(token, headers);
    test.equal(mismatch.status, 403, 'rejected when Host does not match either');
    const viaHost = await request('POST', SET_PATH, {
      host: 'app.internal.test:8080',
      headers,
      body: JSON.stringify({ token }),
    });
    test.equal(viaHost.status, 200, 'accepted when Host matches');
  });

  addTest('set accepts an Origin listed in httpOnlyCookieAllowedOrigins', async (test) => {
    const { token } = await createToken();
    await withOption('httpOnlyCookieAllowedOrigins', ['https://partner.example'], async () => {
      const res = await setCookie(token, {
        'Content-Type': 'application/json',
        Origin: 'https://partner.example',
      });
      test.equal(res.status, 200);
    });
    const after = await setCookie(token, {
      'Content-Type': 'application/json',
      Origin: 'https://partner.example',
    });
    test.equal(after.status, 403, 'rejected again once the allow-list is gone');
  });

  addTest('set accepts browser cross-site metadata for an explicitly allowed Origin', async (test) => {
    const { token } = await createToken();
    await withOption('httpOnlyCookieAllowedOrigins', ['https://partner.example'], async () => {
      for (const fetchSite of ['same-site', 'cross-site']) {
        const res = await setCookie(token, {
          'Content-Type': 'application/json',
          Origin: 'https://partner.example',
          'Sec-Fetch-Site': fetchSite,
        });
        test.equal(res.status, 200, `${fetchSite} request from allowed Origin`);
        test.isTrue(!!setCookieHeader(res), `${fetchSite} request sets the cookie`);
      }
    });
  });

  addTest('set treats X-Forwarded-Proto case-insensitively', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token, jsonSameOrigin({ 'X-Forwarded-Proto': 'HTTPS' }));
    test.equal(res.status, 200);
    test.isTrue(/; Secure(?:;|$)/i.test(setCookieHeader(res)), 'Secure flag');
  });

  addTest('set tolerates a query string but not other sub-paths', async (test) => {
    const { token } = await createToken();
    const withQuery = await request('POST', `${SET_PATH}?x=1`, {
      headers: jsonSameOrigin(),
      body: JSON.stringify({ token }),
    });
    test.equal(withQuery.status, 200);
    const otherPath = await request('POST', `${SET_PATH}anything`, {
      headers: jsonSameOrigin(),
      body: JSON.stringify({ token }),
    });
    test.isTrue(isUnhandled(otherPath), `unexpected status ${otherPath.status}`);
    test.isUndefined(otherPath.headers['set-cookie']);
  });

  ///
  /// POST /set — cross-site requests are refused
  ///

  addTest('set rejects a cross-origin request and sets no cookie', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token, {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
    });
    test.equal(res.status, 403);
    test.equal(res.json && res.json.error, 'cross_origin');
    test.isUndefined(res.headers['set-cookie']);
  });

  addTest('set rejects Sec-Fetch-Site: cross-site even with a matching Origin', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token, jsonSameOrigin({ 'Sec-Fetch-Site': 'cross-site' }));
    test.equal(res.status, 403);
    test.isUndefined(res.headers['set-cookie']);
    const sameSite = await setCookie(token, jsonSameOrigin({ 'Sec-Fetch-Site': 'same-site' }));
    test.equal(sameSite.status, 403, 'same-site (sibling subdomain) is not same-origin');
  });

  addTest('set rejects a request with neither Origin nor Sec-Fetch-Site', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token, { 'Content-Type': 'application/json' });
    test.equal(res.status, 403);
    test.isUndefined(res.headers['set-cookie']);
  });

  addTest('set rejects an opaque "null" Origin', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token, { 'Content-Type': 'application/json', Origin: 'null' });
    test.equal(res.status, 403);
  });

  addTest('set rejects a text/plain body (no-preflight cross-site request shape)', async (test) => {
    const { token } = await createToken();
    const res = await setCookie(token, sameOrigin({ 'Content-Type': 'text/plain' }));
    test.equal(res.status, 415);
    test.isUndefined(res.headers['set-cookie']);
    const form = await setCookie(token, sameOrigin({ 'Content-Type': 'application/x-www-form-urlencoded' }));
    test.equal(form.status, 415);
    const missing = await setCookie(token, sameOrigin());
    test.equal(missing.status, 415);
  });

  ///
  /// POST /set — the token itself is validated
  ///

  addTest('set refuses a token that belongs to nobody', async (test) => {
    const res = await setCookie(Random.secret());
    test.equal(res.status, 401);
    test.equal(res.json && res.json.error, 'invalid_token');
    test.isUndefined(res.headers['set-cookie']);
  });

  addTest('set refuses an expired token', async (test) => {
    const { token } = await createToken({ expired: true });
    const res = await setCookie(token);
    test.equal(res.status, 401);
    test.isUndefined(res.headers['set-cookie']);
  });

  addTest('set refuses a revoked token', async (test) => {
    const { userId, token } = await createToken();
    await Meteor.users.updateAsync(userId, { $set: { 'services.resume.loginTokens': [] } });
    const res = await setCookie(token);
    test.equal(res.status, 401);
    test.isUndefined(res.headers['set-cookie']);
  });

  addTest('set missing token returns 400', async (test) => {
    const res = await request('POST', SET_PATH, { headers: jsonSameOrigin(), body: JSON.stringify({}) });
    test.equal(res.status, 400);
    test.equal(res.json && res.json.error, 'invalid_token');
    const notAString = await request('POST', SET_PATH, {
      headers: jsonSameOrigin(),
      body: JSON.stringify({ token: { $ne: null } }),
    });
    test.equal(notAString.status, 400);
  });

  addTest('set invalid JSON returns 400', async (test) => {
    const res = await request('POST', SET_PATH, { headers: jsonSameOrigin(), body: '{bad' });
    test.equal(res.status, 400);
    test.equal(res.json && res.json.error, 'invalid_body');
  });

  addTest('set rejects an oversized token', async (test) => {
    // Longer than any real login token, but well under the body size limit so
    // the token check (not the 413) is what rejects it.
    const longToken = Array(600).fill('a').join('');
    const res = await request('POST', SET_PATH, {
      headers: jsonSameOrigin(),
      body: JSON.stringify({ token: longToken }),
    });
    test.equal(res.status, 400);
    test.isUndefined(res.headers['set-cookie']);
  });

  addTest('set rejects an oversized body', async (test) => {
    const { token } = await createToken();
    const body = JSON.stringify({ token, padding: 'x'.repeat(64 * 1024) });
    const declared = await request('POST', SET_PATH, { headers: jsonSameOrigin(), body });
    test.equal(declared.status, 413);
    test.isUndefined(declared.headers['set-cookie']);
  });

  addTest('set measures a request body in bytes', async (test) => {
    const body = JSON.stringify({ token: '一'.repeat(1700) });
    const res = await request('POST', SET_PATH, { headers: jsonSameOrigin(), body });
    test.equal(res.status, 413);
    test.equal(res.headers.connection, 'close');
  });

  ///
  /// GET /refresh
  ///

  addTest('refresh returns token & expiry when cookie valid', async (test) => {
    const { token } = await createToken();
    const setRes = await setCookie(token);
    const refreshRes = await request('GET', REFRESH_PATH, {
      headers: { Cookie: cookiePair(setRes), 'Sec-Fetch-Site': 'same-origin' },
    });
    test.equal(refreshRes.status, 200);
    test.equal(refreshRes.json.token, token);
    test.isTrue(!!refreshRes.json.tokenExpires, 'tokenExpires present');
    test.equal(refreshRes.headers['cache-control'], 'no-store');
  });

  addTest('refresh works without Origin or Sec-Fetch-Site (older browsers)', async (test) => {
    const { token } = await createToken();
    const res = await request('GET', REFRESH_PATH, { headers: { Cookie: `${COOKIE_NAME}=${token}` } });
    test.equal(res.status, 200);
    test.equal(res.json.token, token);
  });

  addTest('refresh rejects positively cross-site requests', async (test) => {
    const { token } = await createToken();
    const bySite = await request('GET', REFRESH_PATH, {
      headers: { Cookie: `${COOKIE_NAME}=${token}`, 'Sec-Fetch-Site': 'cross-site' },
    });
    test.equal(bySite.status, 403);
    test.isFalse((bySite.body || '').includes(token), 'token not leaked');
    const byOrigin = await request('GET', REFRESH_PATH, {
      headers: { Cookie: `${COOKIE_NAME}=${token}`, Origin: 'https://evil.example' },
    });
    test.equal(byOrigin.status, 403);
  });

  addTest('refresh 204 body empty & no Set-Cookie when no cookie', async (test) => {
    const res = await request('GET', REFRESH_PATH);
    test.equal(res.status, 204);
    test.equal(res.body, '');
    test.isUndefined(res.headers['set-cookie']);
  });

  addTest('refresh answers unknown and expired tokens identically and clears the cookie', async (test) => {
    const { token: expired } = await createToken({ expired: true });
    const unknownRes = await request('GET', REFRESH_PATH, { headers: { Cookie: `${COOKIE_NAME}=faketoken123` } });
    const expiredRes = await request('GET', REFRESH_PATH, { headers: { Cookie: `${COOKIE_NAME}=${expired}` } });
    test.equal(unknownRes.status, 401);
    test.equal(expiredRes.status, 401);
    test.equal(unknownRes.body, expiredRes.body, 'invalid token responses match');
    test.equal(unknownRes.json && unknownRes.json.error, 'invalid_cookie');
    test.isTrue(EXPIRED_RE.test(setCookieHeader(expiredRes) || ''), 'stale cookie is expired');
  });

  addTest('refresh 401 after the token is revoked', async (test) => {
    const { userId, token } = await createToken();
    const setRes = await setCookie(token);
    await Meteor.users.updateAsync(userId, { $set: { 'services.resume.loginTokens': [] } });
    const refreshRes = await request('GET', REFRESH_PATH, { headers: { Cookie: cookiePair(setRes) } });
    test.equal(refreshRes.status, 401);
    test.equal(refreshRes.json && refreshRes.json.error, 'invalid_cookie');
  });

  ///
  /// POST /clear
  ///

  addTest('clear removes cookie (expires in past) and is idempotent', async (test) => {
    const { token } = await createToken();
    const setRes = await setCookie(token);
    const first = await request('POST', CLEAR_PATH, { headers: sameOrigin({ Cookie: cookiePair(setRes) }) });
    const second = await request('POST', CLEAR_PATH, { headers: sameOrigin({ Cookie: cookiePair(setRes) }) });
    test.equal(first.status, 200);
    test.equal(second.status, 200);
    test.isTrue(EXPIRED_RE.test(setCookieHeader(first)), 'expired date');
    test.isTrue(EXPIRED_RE.test(setCookieHeader(second)), 'still expired on second clear');
    test.isTrue(/SameSite=Strict/i.test(setCookieHeader(first)));
  });

  addTest('clear rejects a cross-origin request', async (test) => {
    const res = await request('POST', CLEAR_PATH, { headers: { Origin: 'https://evil.example' } });
    test.equal(res.status, 403);
    test.isUndefined(res.headers['set-cookie']);
    const bare = await request('POST', CLEAR_PATH);
    test.equal(bare.status, 403);
  });

  ///
  /// Common
  ///

  addTest('invalid HTTP methods return 405', async (test) => {
    const postRefresh = await request('POST', REFRESH_PATH, { headers: sameOrigin() });
    const getSet = await request('GET', SET_PATH, { headers: sameOrigin() });
    const getClear = await request('GET', CLEAR_PATH, { headers: sameOrigin() });
    test.equal(postRefresh.status, 405);
    test.equal(getSet.status, 405);
    test.equal(getClear.status, 405);
    test.equal(getSet.headers.allow, 'POST');
  });

  addTest('endpoints are not served unless useHttpOnlyCookies is enabled on the server', async (test) => {
    const { token } = await createToken();
    const publicSetting = Meteor.settings?.public?.packages?.accounts?.useHttpOnlyCookies;
    test.isFalse(!!publicSetting, 'precondition: public setting not forcing the feature on');
    await withOption('useHttpOnlyCookies', false, async () => {
      test.isFalse(internals.isFeatureEnabled());
      const set = await setCookie(token);
      const refresh = await request('GET', REFRESH_PATH, { headers: { Cookie: `${COOKIE_NAME}=${token}` } });
      const clear = await request('POST', CLEAR_PATH, { headers: sameOrigin() });
      test.isTrue(isUnhandled(set), `set: unexpected status ${set.status}`);
      test.isTrue(isUnhandled(refresh), `refresh: unexpected status ${refresh.status}`);
      test.isTrue(isUnhandled(clear), `clear: unexpected status ${clear.status}`);
      test.isUndefined(set.headers['set-cookie']);
      test.isUndefined(clear.headers['set-cookie']);
      test.isFalse((refresh.body || '').includes(token), 'token not leaked while disabled');
    });
    test.isTrue(internals.isFeatureEnabled(), 'restored');
  });

  addTest('requests are rate limited per client address', async (test) => {
    const { token } = await createToken();
    await withOption('httpOnlyCookieRateLimit', { max: 3, windowMs: 60 * 1000 }, async () => {
      internals.resetRateLimit();
      const statuses = [];
      for (let i = 0; i < 4; i++) {
        const res = await request('GET', REFRESH_PATH, { headers: { Cookie: `${COOKIE_NAME}=${token}` } });
        statuses.push(res.status);
      }
      test.equal(statuses, [200, 200, 200, 429]);
      // The window is shared across endpoints.
      const set = await setCookie(token);
      test.equal(set.status, 429);
      test.isUndefined(set.headers['set-cookie']);
    });
    await withOption('httpOnlyCookieRateLimit', false, async () => {
      internals.resetRateLimit();
      let last;
      for (let i = 0; i < 40; i++) {
        last = await request('GET', REFRESH_PATH, { headers: { Cookie: `${COOKIE_NAME}=${token}` } });
      }
      test.equal(last.status, 200, 'rate limit can be disabled');
    });
  });
}
