import { RoutePolicy } from 'meteor/routepolicy';
import { WebApp } from 'meteor/webapp';

// Keep cookie routes separate from application and static routes.
const COOKIE_BASE_PATH = '/_accounts/cookie';
try {
  RoutePolicy.declare(`${COOKIE_BASE_PATH}/`, 'network');
} catch (e) {
  console.warn(`accounts-base: could not declare ${COOKIE_BASE_PATH}/ as a network route: ${e.message}`);
}

const COOKIE_NAME = 'meteor_login_token';
const SET_PATH = `${COOKIE_BASE_PATH}/set`;
const REFRESH_PATH = `${COOKIE_BASE_PATH}/refresh`;
const CLEAR_PATH = `${COOKIE_BASE_PATH}/clear`;

const MAX_TOKEN_LENGTH = 512;
const MAX_BODY_BYTES = 4 * 1024;

const DEFAULT_RATE_LIMIT = { max: 30, windowMs: 10 * 1000 };

///
/// Configuration
///

function isFeatureEnabled() {
  return !!(
    Accounts._options?.useHttpOnlyCookies ||
    Meteor.settings?.public?.packages?.accounts?.useHttpOnlyCookies
  );
}

function rateLimitConfig() {
  const configured = Accounts._options?.httpOnlyCookieRateLimit;
  if (configured === false) return null;
  if (configured && typeof configured === 'object') {
    return {
      max: Number(configured.max) > 0 ? Number(configured.max) : DEFAULT_RATE_LIMIT.max,
      windowMs: Number(configured.windowMs) > 0 ? Number(configured.windowMs) : DEFAULT_RATE_LIMIT.windowMs,
    };
  }
  return DEFAULT_RATE_LIMIT;
}

///
/// Request helpers
///

function pathname(req) {
  const url = req.url || '';
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    let v = part.slice(idx + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      // keep the raw value
    }
    cookies[k] = v;
  });
  return cookies;
}

function isSecureRequest(req) {
  // honor proxies that set x-forwarded-proto
  const xfp = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return !!(req.connection?.encrypted || xfp === 'https' || req.protocol === 'https');
}

// Honor configured trusted proxies when resolving the client address.
function clientAddress(req) {
  const forwardedCount = parseInt(process.env.HTTP_FORWARDED_COUNT, 10) || 0;
  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  if (forwardedCount <= 0) return remote;
  const header = req.headers['x-forwarded-for'];
  if (typeof header !== 'string') return remote;
  const forwardedFor = header.split(',').map((ip) => ip.trim());
  if (forwardedFor.length !== forwardedCount) return remote;
  return forwardedFor[forwardedFor.length - forwardedCount] || remote;
}

function isJsonContentType(req) {
  const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  return ct === 'application/json';
}

async function readJsonBody(req) {
  const declared = parseInt(req.headers['content-length'], 10);
  if (declared > MAX_BODY_BYTES) return { error: 'too_large' };
  return await new Promise((resolve) => {
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
      if (receivedBytes > MAX_BODY_BYTES) {
        chunks.length = 0;
        req.pause();
        settle({ error: 'too_large' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        settle({ body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      } catch {
        settle({ error: 'invalid_json' });
      }
    });
    req.on('error', () => settle({ error: 'invalid_json' }));
  });
}

///
/// Origin checks
///

function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

// Include configured and request-derived application origins.
function allowedOrigins(req) {
  const origins = new Set();

  let rootUrl = null;
  try {
    rootUrl = Meteor.absoluteUrl();
  } catch {
  }
  const root = normalizeOrigin(rootUrl);
  if (root) origins.add(root);

  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (host) {
    const scheme = isSecureRequest(req) ? 'https' : 'http';
    const fromHost = normalizeOrigin(`${scheme}://${host}`);
    if (fromHost) origins.add(fromHost);
  }

  const extra = Accounts._options?.httpOnlyCookieAllowedOrigins;
  if (Array.isArray(extra)) {
    extra.forEach((entry) => {
      const normalized = normalizeOrigin(entry);
      if (normalized) origins.add(normalized);
    });
  }

  return origins;
}

// Prefer Fetch Metadata, then validate Origin.
function isSameOriginRequest(req) {
  const fetchSite = (req.headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite === 'same-origin') return true;
  if (fetchSite && fetchSite !== 'none') return false;

  const origin = normalizeOrigin(req.headers.origin);
  if (!origin) return false;
  return allowedOrigins(req).has(origin);
}

// Reject explicitly cross-site refresh requests.
function isCrossSiteRequest(req) {
  const fetchSite = (req.headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return true;
  const origin = normalizeOrigin(req.headers.origin);
  if (origin && !allowedOrigins(req).has(origin)) return true;
  return false;
}

///
/// Rate limiting
///

const rateBuckets = new Map();

function isRateLimited(req) {
  const config = rateLimitConfig();
  if (!config) return false;
  const now = Date.now();
  const key = clientAddress(req);
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + config.windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 10000) {
    for (const [k, b] of rateBuckets) {
      if (b.resetAt <= now) rateBuckets.delete(k);
    }
  }
  return bucket.count > config.max;
}

///
/// Cookie + response helpers
///

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

function loginCookie(req, value, expires) {
  return serializeCookie(COOKIE_NAME, value, {
    path: '/',
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'Strict',
    expires,
  });
}

function expiredLoginCookie(req) {
  return loginCookie(req, '', new Date(0));
}

function sendJson(res, code, body, headers = {}) {
  const payload = JSON.stringify(body || {});
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function sendEmpty(res, code, headers = {}) {
  res.writeHead(code, headers);
  res.end();
}

///
/// Token lookup
///

// Support current and legacy login-token storage.
async function findValidLoginToken(token) {
  const hashed = Accounts._hashLoginToken(token);
  const user = await Accounts.users.findOneAsync(
    {
      $or: [
        { 'services.resume.loginTokens.hashedToken': hashed },
        { 'services.resume.loginTokens.token': token },
      ],
    },
    { fields: { 'services.resume.loginTokens': 1 } }
  );
  if (!user) return null;
  const stamped = (user.services?.resume?.loginTokens || []).find(
    (st) => st.hashedToken === hashed || st.token === token
  );
  if (!stamped || !stamped.when) return null;
  const expires = Accounts._tokenExpiration(stamped.when);
  if (!(expires instanceof Date) || Number.isNaN(expires.getTime())) return null;
  if (new Date() >= expires) return null;
  return { userId: user._id, expires };
}

///
/// Handlers
///

async function handleSet(req, res) {
  if (req.method !== 'POST') return sendEmpty(res, 405, { Allow: 'POST' });
  if (isRateLimited(req)) return sendJson(res, 429, { error: 'rate_limited' });
  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: 'cross_origin' });
  if (!isJsonContentType(req)) return sendJson(res, 415, { error: 'unsupported_media_type' });

  const parsed = await readJsonBody(req);
  if (parsed.error === 'too_large') {
    res.setHeader('Connection', 'close');
    return sendJson(res, 413, { error: 'body_too_large' });
  }
  if (parsed.error) return sendJson(res, 400, { error: 'invalid_body' });

  const token = parsed.body && parsed.body.token;
  if (!token || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    return sendJson(res, 400, { error: 'invalid_token' });
  }

  let valid;
  try {
    valid = await findValidLoginToken(token);
  } catch {
    return sendJson(res, 500, { error: 'server_error' });
  }
  if (!valid) return sendJson(res, 401, { error: 'invalid_token' });

  res.setHeader('Set-Cookie', loginCookie(req, token, valid.expires));
  return sendJson(res, 200, { ok: true });
}

async function handleRefresh(req, res) {
  if (req.method !== 'GET') return sendEmpty(res, 405, { Allow: 'GET' });
  if (isRateLimited(req)) return sendJson(res, 429, { error: 'rate_limited' });
  if (isCrossSiteRequest(req)) return sendJson(res, 403, { error: 'cross_origin' });

  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return sendEmpty(res, 204, { 'Cache-Control': 'no-store' });
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    res.setHeader('Set-Cookie', expiredLoginCookie(req));
    return sendJson(res, 401, { error: 'invalid_cookie' });
  }

  let valid;
  try {
    valid = await findValidLoginToken(token);
  } catch {
    return sendJson(res, 500, { error: 'server_error' });
  }
  if (!valid) {
    res.setHeader('Set-Cookie', expiredLoginCookie(req));
    return sendJson(res, 401, { error: 'invalid_cookie' });
  }

  return sendJson(res, 200, { token, tokenExpires: valid.expires }, { Vary: 'Cookie' });
}

async function handleClear(req, res) {
  if (req.method !== 'POST') return sendEmpty(res, 405, { Allow: 'POST' });
  if (isRateLimited(req)) return sendJson(res, 429, { error: 'rate_limited' });
  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: 'cross_origin' });

  res.setHeader('Set-Cookie', expiredLoginCookie(req));
  return sendJson(res, 200, { ok: true });
}

const ROUTES = {
  [SET_PATH]: handleSet,
  [REFRESH_PATH]: handleRefresh,
  [CLEAR_PATH]: handleClear,
};

WebApp.handlers.use(async (req, res, next) => {
  const path = pathname(req);
  if (!path.startsWith(`${COOKIE_BASE_PATH}/`)) return next();
  const handler = ROUTES[path];
  if (!handler || !isFeatureEnabled()) return next();
  try {
    await handler(req, res);
  } catch {
    if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
    else res.end();
  }
});

export const httpOnlyCookieInternals = {
  COOKIE_NAME,
  resetRateLimit: () => rateBuckets.clear(),
  isSameOriginRequest,
  isCrossSiteRequest,
  isFeatureEnabled,
};
