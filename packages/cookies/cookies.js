Cookies = {};

// Given the value of a Cookie header, returns a dictionary of cookie
// keys => values. If passed the empty string (or a string that is all
// whitespace), returns {}
//
// cookieString is the value of document.cookies or a Cookie header,
// for example "a=b; c=d".
Cookies.parse = function (cookieString) {
  var cookies = {};
  var cookieParts = cookieString.split(/\s*;\s*/);
  _.each(cookieParts, function (part) {
    var match = part.match(/^([^=]+)=(.*)/);
    if (match)
      // Browsers are not supposed to send multiple values for the
      // same cookie, but if they do, do the easy thing, which is to
      // take the last value seen.
      cookies[match[1]] = match[2];
  });

  return cookies;
};


// Given a dictionary of cookie names and values, return a Cookie
// header (as parsed by Cookies.parse).
//
// No attempt is made to sanitize or quote characters in the cookie
// name or value. Behavior varies between browsers, between RFCs, and
// between browsers and RFCs. If you want to play it safe, good advice
// would be to limit cookie names to alphanumerics, dashes, and
// underscores, and limit cookie values to printable ASCII characters
// excluding quote, comma, semicolon, backspace, and whitespace.
Cookies.stringify = function (cookies) {
  // RFC6265 says that valid characters in a cookie name are:
  //   token             = <token, defined in [RFC2616], Section 2.2>
  // RFC2616 is HTTP 1.1 and defines 'token' as:
  //   token             = 1*<any CHAR except CTLs or separators>
  //   separators        = "(" | ")" | "<" | ">" | "@"
  //                     | "," | ";" | ":" | "\" | <">
  //                     | "/" | "[" | "]" | "?" | "="
  //                     | "{" | "}" | SP | HT
  //
  // RFC6265 says that valid characters in a cookie value are:
  //   cookie-value      = *cookie-octet / ( DQUOTE *cookie-octet DQUOTE )
  //   cookie-octet      = %x21 / %x23-2B / %x2D-3A / %x3C-5B / %x5D-7E
  //                     ; US-ASCII characters excluding CTLs,
  //                     ; whitespace DQUOTE, comma, semicolon,
  //                     ; and backslash
  //
  // In practice, browsers (at least Chrome) permit a wider range of
  // characters in cookie values (such as, in Chome, at least comma
  // and double quote). So for now we're going to not worry about this
  // and trust the user to know what characters their targeted
  // browsers tolerate.
  return _.map(cookies, function (value, key) {
    return key + "=" + value;
  }).join(";");
};
