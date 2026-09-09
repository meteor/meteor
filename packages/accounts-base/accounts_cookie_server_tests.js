if (Meteor.isServer) {
  const COOKIE_NAME = 'meteor_login_token';
  const REFRESH_PATH = '/_accounts/cookie/refresh';
  const SET_PATH = '/_accounts/cookie/set';
  const CLEAR_PATH = '/_accounts/cookie/clear';

  // The cookie endpoints only answer when the HttpOnly cookie flow is
  // enabled, so turn it on for this test app.
  Accounts.config({ useHttpOnlyCookies: true });

  // Utility: simple HTTP request using Node's http/https depending on absoluteUrl
  const request = async (method, path, { headers, body } = {}) => {
    const url = Meteor.absoluteUrl(path.replace(/^\//,''));
    const { URL } = Npm.require('url');
    const u = new URL(url);
    const opts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + (u.search||''),
      method,
      headers: headers || {}
    };
    const httpLib = Npm.require(u.protocol === 'https:' ? 'https' : 'http');
    return new Promise((resolve, reject) => {
      const req = httpLib.request(opts, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let json;
          try { json = data ? JSON.parse(data) : undefined; } catch (_e) {}
          resolve({ status: res.statusCode, headers: res.headers, body: data, json });
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  };

  Tinytest.addAsync('accounts cookie - set endpoint sets HttpOnly cookie with flags', async (test, done) => {
    // Create a user & token
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stamped);

    const res = await request('POST', SET_PATH, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: stamped.token })
    });
    test.equal(res.status, 200);
    const setCookie = res.headers['set-cookie'] && res.headers['set-cookie'][0];
    test.isTrue(/meteor_login_token=/.test(setCookie), 'cookie name');
    test.isTrue(/HttpOnly/i.test(setCookie), 'HttpOnly flag');
    test.isTrue(/SameSite=Lax/i.test(setCookie), 'SameSite flag');
    // Secure might be absent in test (http) environment, accept either
    done();
  });

  Tinytest.addAsync('accounts cookie - refresh returns token & expiry when cookie valid', async (test, done) => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stamped);

    const setRes = await request('POST', SET_PATH, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: stamped.token })
    });
    const cookieHeader = setRes.headers['set-cookie'][0].split(';')[0];

    const refreshRes = await request('GET', REFRESH_PATH, { headers: { 'Cookie': cookieHeader } });
    test.equal(refreshRes.status, 200);
    test.equal(refreshRes.json.token, stamped.token);
    test.isTrue(!!refreshRes.json.tokenExpires, 'tokenExpires present');
    done();
  });

  Tinytest.addAsync('accounts cookie - refresh 204 when no cookie', async (test, done) => {
    const res = await request('GET', REFRESH_PATH);
    test.equal(res.status, 204);
    done();
  });

  Tinytest.addAsync('accounts cookie - refresh 401 for invalid token', async (test, done) => {
    const fakeCookie = 'meteor_login_token=faketoken123';
    const res = await request('GET', REFRESH_PATH, { headers: { 'Cookie': fakeCookie } });
    test.equal(res.status, 401);
    done();
  });

  Tinytest.addAsync('accounts cookie - clear removes cookie (expires in past)', async (test, done) => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stamped);
    const setRes = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stamped.token }) });
    const cookieToSend = setRes.headers['set-cookie'][0].split(';')[0];

    const clearRes = await request('POST', CLEAR_PATH, { headers: { 'Cookie': cookieToSend } });
    test.equal(clearRes.status, 200);
    const cleared = clearRes.headers['set-cookie'][0];
    test.isTrue(/Expires=Thu, 01 Jan 1970|Expires=Wed, 31 Dec 1969/.test(cleared) || /1970 GMT/.test(cleared), 'expired date');
    done();
  });

  Tinytest.addAsync('accounts cookie - refresh 204 body empty & no Set-Cookie', async (test, done) => {
    const res = await request('GET', REFRESH_PATH);
    test.equal(res.status, 204);
    test.equal(res.body, '');
    test.isUndefined(res.headers['set-cookie']);
    done();
  });

  Tinytest.addAsync('accounts cookie - expired token yields 401 expired', async (test, done) => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    // Force past expiry by moving earlier than the configured lifetime
    const lifetimeMs = Accounts._getTokenLifetimeMs ? Accounts._getTokenLifetimeMs() : (90 * 24 * 60 * 60 * 1000);
    stamped.when = new Date(Date.now() - lifetimeMs - 1000);
    await Accounts._insertLoginToken(userId, stamped);
    const setRes = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stamped.token }) });
    const cookieHeader = setRes.headers['set-cookie'][0].split(';')[0];
    const refreshRes = await request('GET', REFRESH_PATH, { headers: { 'Cookie': cookieHeader } });
    test.equal(refreshRes.status, 401);
    test.equal(refreshRes.json && refreshRes.json.error, 'expired');
    done();
  });

  Tinytest.addAsync('accounts cookie - revoked token yields 401 invalid_cookie', async (test, done) => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stamped);
    const setRes = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stamped.token }) });
    // Remove all login tokens simulating revocation
    await Meteor.users.updateAsync(userId, { $set: { 'services.resume.loginTokens': [] } });
    const cookieHeader = setRes.headers['set-cookie'][0].split(';')[0];
    const refreshRes = await request('GET', REFRESH_PATH, { headers: { 'Cookie': cookieHeader } });
    test.equal(refreshRes.status, 401);
    test.equal(refreshRes.json && refreshRes.json.error, 'invalid_cookie');
    done();
  });

  Tinytest.addAsync('accounts cookie - clear idempotent (second clear still expired)', async (test, done) => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stamped);
    const setRes = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stamped.token }) });
    const cookie = setRes.headers['set-cookie'][0].split(';')[0];
    const first = await request('POST', CLEAR_PATH, { headers: { 'Cookie': cookie } });
    const second = await request('POST', CLEAR_PATH, { headers: { 'Cookie': cookie } });
    test.equal(first.status, 200);
    test.equal(second.status, 200);
    const hdr = second.headers['set-cookie'][0];
    test.isTrue(/Expires=Thu, 01 Jan 1970|Expires=Wed, 31 Dec 1969/.test(hdr) || /1970 GMT/.test(hdr));
    done();
  });

  Tinytest.addAsync('accounts cookie - cookie path and no domain leakage', async (test, done) => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stamped = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stamped);
    const res = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stamped.token }) });
    const setCookie = res.headers['set-cookie'][0];
    test.isTrue(/Path=\//.test(setCookie), 'Path=/ present');
    test.isFalse(/Domain=/.test(setCookie), 'no Domain attribute by default');
    done();
  });

  Tinytest.addAsync('accounts cookie - invalid HTTP methods return 405', async (test, done) => {
    const postRefresh = await request('POST', REFRESH_PATH); // should be GET
    const getSet = await request('GET', SET_PATH); // should be POST
    const getClear = await request('GET', CLEAR_PATH); // should be POST
    test.equal(postRefresh.status, 405);
    test.equal(getSet.status, 405);
    test.equal(getClear.status, 405);
    done();
  });

  Tinytest.addAsync('accounts cookie - set missing token returns 400', async (test, done) => {
    const res = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    test.equal(res.status, 400);
    test.equal(res.json && res.json.error, 'invalid_token');
    done();
  });

  Tinytest.addAsync('accounts cookie - set invalid JSON returns 400', async (test, done) => {
    // send malformed JSON: request helper will send body as-is
    const res = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    test.equal(res.status, 400);
    test.equal(res.json && res.json.error, 'invalid_token');
    done();
  });

  Tinytest.addAsync('accounts cookie - set rejects oversized body with 413', async (test, done) => {
    const longToken = Array(5000).fill('a').join('');
    const res = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: longToken }) });
    test.equal(res.status, 413);
    test.equal(res.json && res.json.error, 'body_too_large');
    done();
  });

  Tinytest.addAsync('accounts cookie - set rejects oversized Content-Length up front', async (test, done) => {
    const longToken = Array(5000).fill('a').join('');
    const body = JSON.stringify({ token: longToken });
    const res = await request('POST', SET_PATH, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });
    test.equal(res.status, 413);
    test.equal(res.json && res.json.error, 'body_too_large');
    done();
  });

  Tinytest.addAsync('accounts cookie - set counts body limit in bytes, not string length', async (test, done) => {
    // 1700 three-byte characters: 1712 UTF-16 code units (under 4096) but
    // 5112 UTF-8 bytes (over the limit)
    const multiByteToken = Array(1700).fill('一').join('');
    const res = await request('POST', SET_PATH, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: multiByteToken }) });
    test.equal(res.status, 413);
    test.equal(res.json && res.json.error, 'body_too_large');
    done();
  });

  Tinytest.addAsync('accounts cookie - set closes the connection after 413 on an unfinished chunked body', async (test, done) => {
    const { URL } = Npm.require('url');
    const u = new URL(Meteor.absoluteUrl(SET_PATH.replace(/^\//, '')));
    const httpLib = Npm.require(u.protocol === 'https:' ? 'https' : 'http');
    const result = await new Promise((resolve) => {
      const req = httpLib.request({
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        // No Content-Length: the body is sent chunked, so the server can only
        // detect the overflow while streaming.
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => data += chunk);
        const socketClosed = new Promise((resolveClose) => {
          res.socket.once('close', () => resolveClose(true));
        });
        res.on('end', async () => {
          // Regression (#14657 review): the server used to answer 413 but
          // leave the paused request holding the keep-alive socket open.
          const closed = await Promise.race([
            socketClosed,
            new Promise((resolveClose) => setTimeout(() => resolveClose(false), 5000)),
          ]);
          resolve({ status: res.statusCode, headers: res.headers, body: data, closed });
        });
      });
      // The server tears the socket down mid-upload; the client-side error
      // that produces is expected, not a test failure.
      req.on('error', () => {});
      // Stream past the limit and never call req.end(), like an upload that
      // is arbitrarily large or never finishes.
      req.write(Array(5000).fill('a').join(''));
    });
    test.equal(result.status, 413);
    let json;
    try { json = JSON.parse(result.body); } catch (_e) {}
    test.equal(json && json.error, 'body_too_large');
    test.equal(result.headers.connection, 'close');
    test.isTrue(result.closed, 'socket closed after 413');
    done();
  });

  Tinytest.addAsync('accounts cookie - endpoints fall through when feature disabled', async (test, done) => {
    const saved = Accounts._options.useHttpOnlyCookies;
    Accounts._options.useHttpOnlyCookies = false;
    try {
      const setRes = await request('POST', SET_PATH, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'whatever' })
      });
      test.isUndefined(setRes.headers['set-cookie'], 'set: no cookie when disabled');
      test.isTrue(!setRes.json || setRes.json.ok !== true, 'set: not handled when disabled');

      // Every response from the refresh handler is application/json, so a
      // non-JSON response proves the request fell through to the app stack.
      const refreshRes = await request('GET', REFRESH_PATH);
      test.isTrue(refreshRes.status !== 204, 'refresh: not handled when disabled');
      const refreshType = (refreshRes.headers['content-type'] || '');
      test.isFalse(refreshType.includes('application/json'), 'refresh: no JSON response when disabled');

      const clearRes = await request('POST', CLEAR_PATH);
      test.isUndefined(clearRes.headers['set-cookie'], 'clear: no cookie when disabled');
      test.isTrue(!clearRes.json || clearRes.json.ok !== true, 'clear: not handled when disabled');
    } finally {
      Accounts._options.useHttpOnlyCookies = saved;
    }
    done();
  });
}
