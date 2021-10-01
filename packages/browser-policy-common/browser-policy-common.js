BrowserPolicy = {};

var inTest = false;

BrowserPolicy._runningTest = function () {
  return inTest;
};

BrowserPolicy._setRunningTest = function () {
  inTest = true;
};

WebApp.connectHandlers.use(function (req, res, next) {
  // Never set headers inside tests because they could break other tests.
  if (BrowserPolicy._runningTest())
    return next();

  var xFrameOptions = BrowserPolicy.framing &&
        BrowserPolicy.framing._constructXFrameOptions();
  var csp = BrowserPolicy.content &&
        BrowserPolicy.content._constructCsp();
  if (xFrameOptions) {
    res.setHeader("X-Frame-Options", xFrameOptions);
  }
  if (csp) {
    res.setHeader("Content-Security-Policy", csp);
  }
  next();
});

// We use `rawConnectHandlers` to set X-Content-Type-Options on all
// requests, including static files.
// XXX We should probably use `rawConnectHandlers` for X-Frame-Options
// and Content-Security-Policy too, but let's make sure that doesn't
// break anything first (e.g. the OAuth popup flow won't work well with
// a CSP that disallows inline scripts).
WebApp.rawConnectHandlers.use(function (req, res, next) {
  if (BrowserPolicy._runningTest())
    return next();

  var contentTypeOptions = BrowserPolicy.content &&
        BrowserPolicy.content._xContentTypeOptions();
  if (contentTypeOptions) {
    res.setHeader("X-Content-Type-Options", contentTypeOptions);
  }
  next();
});
