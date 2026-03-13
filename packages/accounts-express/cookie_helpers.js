const COOKIE_NAME = 'meteor_login_token';

function isSecureRequest(req) {
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

/**
 * Set the meteor_login_token HttpOnly cookie on an Express response.
 * Mirrors the cookie format used by accounts-base/server_http_cookies.js.
 */
export function setCookieOnResponse(res, req, token, tokenExpires) {
  const secure = isSecureRequest(req);
  const cookie = serializeCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    expires: tokenExpires instanceof Date ? tokenExpires : undefined,
  });
  res.setHeader('Set-Cookie', cookie);
}

/**
 * Clear the meteor_login_token HttpOnly cookie on an Express response.
 */
export function clearCookieOnResponse(res, req) {
  const secure = isSecureRequest(req);
  const cookie = serializeCookie(COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    expires: new Date(0),
  });
  res.setHeader('Set-Cookie', cookie);
}
