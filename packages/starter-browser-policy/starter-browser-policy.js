BrowserPolicy.allowFramingBySameOrigin();

// By default, unsafe inline scripts and styles are allowed, since we expect
// many apps will use them for analytics, etc. Unsafe eval is disallowed, and
// the only allowable content source is the same origin or data, except for
// connect which allows anything (since meteor.com apps make websocket
// connections to a lot of different origins).

BrowserPolicy.setContentSecurityPolicy("default-src 'self'; " +
                                       "script-src 'self' 'unsafe-inline'; " +
                                       "connect-src *; " +
                                       "img-src data: 'self'; " +
                                       "style-src 'self' 'unsafe-inline';");
