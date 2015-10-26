var fs = Npm.require('fs');
var child_process = Npm.require('child_process');
var querystring = Npm.require('querystring');
var urlParser = Npm.require('url');

// list of bot user agents that we want to serve statically, but do
// not obey the _escaped_fragment_ protocol. The page is served
// statically to any client whos user agent matches any of these
// regexps. Users may modify this array.
//
// An original goal with the spiderable package was to avoid doing
// user-agent based tests. But the reality is not enough bots support
// the _escaped_fragment_ protocol, so we need to hardcode a list
// here. I shed a silent tear.
Spiderable.userAgentRegExps = [
  /^facebookexternalhit/i,
  /^Facebot/,
  /^linkedinbot/i,
  /^twitterbot/i,
  /^slackbot-linkexpanding/i
];

// how long to let phantomjs run before we kill it (and send down the
// regular page instead). Users may modify this number.
Spiderable.requestTimeoutMs = 15*1000;
// maximum size of result HTML. node's default is 200k which is too
// small for our docs.
var MAX_BUFFER = 5*1024*1024; // 5MB

// Exported for tests.
Spiderable._urlForPhantom = function (siteAbsoluteUrl, requestUrl) {
  // reassembling url without escaped fragment if exists
  var parsedUrl = urlParser.parse(requestUrl);
  var parsedQuery = querystring.parse(parsedUrl.query);
  var escapedFragment = parsedQuery['_escaped_fragment_'];
  delete parsedQuery['_escaped_fragment_'];

  var parsedAbsoluteUrl = urlParser.parse(siteAbsoluteUrl);
  // If the ROOT_URL contains a path, Meteor strips that path off of the
  // request's URL before we see it. So we concatenate the pathname from
  // the request's URL with the root URL's pathname to get the full
  // pathname.
  if (parsedUrl.pathname.charAt(0) === "/") {
    parsedUrl.pathname = parsedUrl.pathname.substring(1);
  }
  parsedAbsoluteUrl.pathname = urlParser.resolve(parsedAbsoluteUrl.pathname,
                                                 parsedUrl.pathname);
  parsedAbsoluteUrl.query = parsedQuery;
  // `url.format` will only use `query` if `search` is absent
  parsedAbsoluteUrl.search = null;

  if (escapedFragment !== undefined && escapedFragment !== null && escapedFragment.length > 0) {
    parsedAbsoluteUrl.hash = '!' + decodeURIComponent(escapedFragment);
  }

  return urlParser.format(parsedAbsoluteUrl);
};

var PHANTOM_SCRIPT = Assets.getText("phantom_script.js");

WebApp.connectHandlers.use(function (req, res, next) {
  // _escaped_fragment_ comes from Google's AJAX crawling spec:
  // https://developers.google.com/webmasters/ajax-crawling/docs/specification
  if (/\?.*_escaped_fragment_=/.test(req.url) ||
      _.any(Spiderable.userAgentRegExps, function (re) {
        return re.test(req.headers['user-agent']); })) {

    var url = Spiderable._urlForPhantom(Meteor.absoluteUrl(), req.url);

    // This string is going to be put into a bash script, so it's important
    // that 'url' (which comes from the network) can neither exploit phantomjs
    // or the bash script. JSON stringification should prevent it from
    // exploiting phantomjs, and since the output of JSON.stringify shouldn't
    // be able to contain newlines, it should be unable to exploit bash as
    // well.
    var phantomScript = "var url = " + JSON.stringify(url) + ";" +
          PHANTOM_SCRIPT;

    // Allow override of phantomjs args via env var
    // We use one env var to try to keep env-var explosion under control.
    // We're not going to document this unless it is actually needed;
    // (if you find yourself needing this please let us know the use case!)
    var phantomJsArgs = process.env.METEOR_PKG_SPIDERABLE_PHANTOMJS_ARGS || '';

    // Default image loading to off (we don't need images)
    if (phantomJsArgs.indexOf("--load-images=") === -1) {
      phantomJsArgs += " --load-images=no";
    }

    // POODLE means SSLv3 is being turned off everywhere.
    // phantomjs currently defaults to SSLv3, and won't use TLS.
    // Use --ssl-protocol to set the default to TLSv1
    // (another option would be 'any', but really, we want to say >= TLSv1)
    // More info: https://groups.google.com/forum/#!topic/meteor-core/uZhT3AHwpsI
    if (phantomJsArgs.indexOf("--ssl-protocol=") === -1) {
      phantomJsArgs += " --ssl-protocol=TLSv1";
    }

    // Run phantomjs.
    //
    // Use '/dev/stdin' to avoid writing to a temporary file. We can't
    // just omit the file, as PhantomJS takes that to mean 'use a
    // REPL' and exits as soon as stdin closes.
    //
    // However, Node 0.8 broke the ability to open /dev/stdin in the
    // subprocess, so we can't just write our string to the process's stdin
    // directly; see https://gist.github.com/3751746 for the gory details. We
    // work around this with a bash heredoc. (We previous used a "cat |"
    // instead, but that meant we couldn't use exec and had to manage several
    // processes.)
    child_process.execFile(
      '/bin/bash',
      ['-c',
       ("exec phantomjs " + phantomJsArgs + " /dev/stdin <<'END'\n" +
        phantomScript + "END\n")],
      {timeout: Spiderable.requestTimeoutMs, maxBuffer: MAX_BUFFER},
      function (error, stdout, stderr) {
        if (!error && /<html/i.test(stdout)) {
          res.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
          res.end(stdout);
        } else {
          // phantomjs failed. Don't send the error, instead send the
          // normal page.
          if (error && error.code === 127)
            Meteor._debug("spiderable: phantomjs not installed. Download and install from http://phantomjs.org/");
          else
            Meteor._debug("spiderable: phantomjs failed at " + url + ":", error, "\nstderr:", stderr, "\nstdout:", stdout);

          next();
        }
      });
  } else {
    next();
  }
});
