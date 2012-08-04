(function () {
  var fs = __meteor_bootstrap__.require('fs');
  var spawn = __meteor_bootstrap__.require('child_process').spawn;
  var querystring = __meteor_bootstrap__.require('querystring');
  var app = __meteor_bootstrap__.app;

  app.use(function (req, res, next) {
    if (/\?.*_escaped_fragment_=/.test(req.url)) {
      // get escaped fragment out of the url. Gross!
      var preQuery = req.url.split("?")[0];
      var queryStr = req.url.split("?")[1];
      var parsed = querystring.parse(queryStr);
      delete parsed['_escaped_fragment_'];
      var newQuery = querystring.stringify(parsed);
      var newPath = preQuery + (newQuery ? "?" + newQuery : "");
      var url = "http://" + req.headers.host + newPath;

      // run phantomjs
      //
      // Use '/dev/stdin' to avoid writing to a temporary file. Can't
      // just omit the file, as PhantomJS takes that to mean 'use a
      // REPL' and exits as soon as stdin closes.
      var cp = spawn('phantomjs', ['--load-images=no', '/dev/stdin']);

      var data = '';
      cp.stdout.setEncoding('utf8');
      cp.stdout.on('data', function (chunk) {
        data += chunk;
      });

      cp.on('exit', function (code) {
        if (0 === code && /<html>/i.test(data)) {
          res.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
          res.end(data);
        } else {
          // phantomjs failed. Don't send the error, instead send the
          // normal page.
          if (code === 127)
            Meteor._debug("spiderable: phantomjs not installed. Download and install from http://phantomjs.org/");
          else
            Meteor._debug("spiderable: phantomjs failed:", code, data);

          next();
        }
      });

      // don't crash w/ EPIPE if phantomjs isn't installed.
      cp.stdin.on('error', function () {});

      cp.stdin.write(
        "var url = '" + url + "';" +
"var page = require('webpage').create();" +

"page.open(url);" +

"var lastContent;" +
"var settledCount = 0;" +
"var count = 0;" +

"setInterval(function() {" +
"  var connected = page.evaluate(function () {" +
"    return typeof Meteor !== 'undefined' && Meteor.status().connected;" +
"  });" +
"  if (!connected || page.content !== lastContent) {" +
"    settledCount = 0;" +
"    lastContent = page.content;" +
"  } else {" +
"    settledCount += 1;" +
"  }" +

"  if (settledCount >= 3 || count >= 100) {" +
"    var out = page.content;" +
"    out = out.replace(/<script[^>]+>(.|\\n|\\r)*?<\\/script\\s*>/ig, '');" +
"    out = out.replace('<meta name=\"fragment\" content=\"!\">', '');" +

"    console.log(out);" +
"    phantom.exit();" +
"  }" +
"}, 100);");
      cp.stdin.end();

    } else {
      next();
    }
  });
})();
