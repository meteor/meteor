// If the current origin (and path) has a (non-HttpOnly) cookie for
// 'name', return it. Otherwise return null.
Cookies.get = function (name) {
  var cookies = Cookies.parse(document.cookie || '');
  return _.has(cookies, name) ? cookies[name] : null;
};

// Set a cookie 'name'='value on the current origin. It is the
// caller's responsibility to ensure that 'name' and 'value' contain
// only characters that are legal in cookie names and values.
//
// Options may include:
//
// - path: Path prefix for which the cookie should be sent. If not
//   specified, defaults to the current path of document.location.
//
// - domain: Domain for which the cookie should be sent. Default to
//   the current domain (more precisely, the host part of the current
//   document.location). Use ".mysite.com" to send to mysite.com and
//   all of mysite's subdomains.
//
// - maxAge: How long the cookie should live (in seconds). If not
//   provided, the cookie will expire at the end of the browser
//   session.
//
// - secure: If true, provide this cookie only for secure (https)
//   connections. If you call this from a page that was loaded over
//   http, the cookie will be set but you won't be able to read it
//   back unless the user reloads the page over https.
//
// To delete a cookie, set maxAge to zero, passing the same name,
// domain, and path.
Cookies.set = function (name, value, options) {
  options = options || {};

  var cmd = name + '=' + value;
  if (_.has(options, 'path'))
    cmd += ";path=" + options.path;
  if (_.has(options, 'domain'))
    cmd += ";domain=" + options.domain;
  if (_.has(options, "maxAge")) {
    // Not all browsers support 'max-age', but all support 'expires'.
    var when = new Date((new Date).getTime() + options.maxAge * 1000);
    cmd += ";expires=" + when.toUTCString();
  }
  if (_.has(options, "secure"))
    cmd += ";secure";

  // This does not set document.cookie. It causes the browser to
  // behave as if it had received a Set-Cookie header with the value
  // 'cmd'.
  //
  // "This is the worst interface I have ever seen in my life." -- Emily
  document.cookie = cmd;
};
