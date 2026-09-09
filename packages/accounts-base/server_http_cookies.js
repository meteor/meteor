import RoutePolicy from 'meteor/routepolicy';
import { WebApp } from 'meteor/webapp';

// Declare these routes as network to avoid clashes with static assets
const COOKIE_BASE_PATH = '/_accounts/cookie';
try {
  RoutePolicy.declare(COOKIE_BASE_PATH + '/', 'network');
} catch (_e) {
  // ignore duplicate declarations
}

const COOKIE_NAME = 'meteor_login_token';

// The expected payload is a small JSON object carrying a login token, so
// anything beyond a few KB cannot be a valid request.
const MAX_JSON_BODY_BYTES = 4096;

// The HttpOnly cookie flow is opt-in. Checked per request (instead of at
// module load) because Accounts.config typically runs inside Meteor.startup,
// after these handlers are registered. When disabled, the handlers fall
// through so the routes behave as if they were never mounted.
function httpOnlyCookiesEnabled() {
  return !!(
    Accounts?._options?.useHttpOnlyCookies ||
    Meteor.settings?.public?.packages?.accounts?.useHttpOnlyCookies
  );
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[k] = v;
  });
  return cookies;
}

function isSecureRequest(req) {
  // honor proxies that set x-forwarded-proto
  const xfp = (req.headers['x-forwarded-proto'] || '').split(',')[0];
  return req.connection?.encrypted || xfp === 'https' || req.protocol === 'https';
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value))}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

// Resolves with the parsed body, or null when the body exceeds
// MAX_JSON_BODY_BYTES (checked against Content-Length up front and again
// while streaming, so chunked requests cannot bypass the limit).
async function readJson(req) {
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength > MAX_JSON_BODY_BYTES) return null;
  return await new Promise((resolve) => {
    // Accumulate raw buffers so the limit counts UTF-8 bytes; string length
    // would undercount multi-byte characters.
    const chunks = [];
    let receivedBytes = 0;
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_JSON_BODY_BYTES) {
        chunks.length = 0;
        req.pause();
        settle(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        settle(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (_e) {
        settle({});
      }
    });
    req.on('error', () => settle(null));
  });
}

function sendJson(res, code, body) {
  const payload = JSON.stringify(body || {});
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

// POST /_accounts/cookie/set
// Body: { token: string, tokenExpires?: string|number }
WebApp.handlers.use(async (req, res, next) => {
  if (!req.url.startsWith(COOKIE_BASE_PATH + '/set')) return next();
  if (!httpOnlyCookiesEnabled()) return next();
  if (req.method !== 'POST') {
    res.writeHead(405);
    return res.end();
  }
  const body = await readJson(req);
  if (body === null) {
    // The client may still be streaming an arbitrarily large (or endless)
    // body that we stopped consuming, so close the connection instead of
    // leaving the paused request holding the keep-alive socket open.
    res.setHeader('Connection', 'close');
    return sendJson(res, 413, { error: 'body_too_large' });
  }
  const token = body && body.token;
  if (!token || typeof token !== 'string') {
    return sendJson(res, 400, { error: 'invalid_token' });
  }
  // Try to find a matching token to get expiration
  let expires;
  try {
    const hashed = Accounts._hashLoginToken(token);
    const user = await Accounts.users.findOneAsync({
      $or: [
        { 'services.resume.loginTokens.hashedToken': hashed },
        { 'services.resume.loginTokens.token': token },
      ]
    }, { fields: { 'services.resume.loginTokens': 1 } });
    if (user) {
      const t = (user.services.resume.loginTokens || []).find((st) => st.hashedToken === hashed || st.token === token);
      if (t && t.when) {
        expires = Accounts._tokenExpiration(t.when);
      }
    }
  } catch (_e) {}

  const secure = isSecureRequest(req);
  // Default cookie opts; prefer Lax to allow same-site navigations
  const cookie = serializeCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    expires: expires instanceof Date ? expires : undefined,
  });
  res.setHeader('Set-Cookie', cookie);
  return sendJson(res, 200, { ok: true });
});

// GET /_accounts/cookie/refresh
// Returns { token, tokenExpires, id } if cookie is valid
WebApp.handlers.use(async (req, res, next) => {
  if (!req.url.startsWith(COOKIE_BASE_PATH + '/refresh')) return next();
  if (!httpOnlyCookiesEnabled()) return next();
  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end();
  }
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return sendJson(res, 204, {});
  try {
    const hashed = Accounts._hashLoginToken(token);
    // Find user and token
    const user = await Accounts.users.findOneAsync({
      $or: [
        { 'services.resume.loginTokens.hashedToken': hashed },
        { 'services.resume.loginTokens.token': token },
      ]
    }, { fields: { 'services.resume.loginTokens': 1 } });
    if (!user) return sendJson(res, 401, { error: 'invalid_cookie' });
    const stamped = (user.services.resume.loginTokens || []).find((st) => st.hashedToken === hashed || st.token === token);
    if (!stamped) return sendJson(res, 401, { error: 'invalid_cookie' });
    const tokenExpires = Accounts._tokenExpiration(stamped.when);
    if (new Date() >= tokenExpires) return sendJson(res, 401, { error: 'expired' });
    return sendJson(res, 200, { token, tokenExpires });
  } catch (e) {
    return sendJson(res, 500, { error: 'server_error' });
  }
});

// POST /_accounts/cookie/clear
WebApp.handlers.use(async (req, res, next) => {
  if (!req.url.startsWith(COOKIE_BASE_PATH + '/clear')) return next();
  if (!httpOnlyCookiesEnabled()) return next();
  if (req.method !== 'POST') {
    res.writeHead(405);
    return res.end();
  }
  const secure = isSecureRequest(req);
  const expired = new Date(0);
  const cookie = serializeCookie(COOKIE_NAME, '', {
    path: '/', httpOnly: true, secure, sameSite: 'Lax', expires: expired
  });
  res.setHeader('Set-Cookie', cookie);
  return sendJson(res, 200, { ok: true });
});

