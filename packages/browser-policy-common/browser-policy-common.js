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
  if (xFrameOptions)
    res.setHeader("X-Frame-Options", xFrameOptions);
  if (csp)
    res.setHeader("Content-Security-Policy", csp);
  next();
});
