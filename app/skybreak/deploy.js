exports.HOSTNAME = 'deploy.skybreakplatform.com';


// accepts www.host.com, defaults domain to skybreakplatform, defaults
// protocol to http.
//
// XXX shared w/ proxy.js
exports.parse_url = function (url) {
  if (!url.match(':\/\/'))
    url = 'http://' + url;

  var parsed = require('url').parse(url);

  delete parsed.host; // we use hostname

  if (parsed.hostname && !parsed.hostname.match(/\./))
    parsed.hostname += '.skybreakplatform.com';

  return parsed;
}

