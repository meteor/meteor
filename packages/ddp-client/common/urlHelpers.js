import { LivedataTest } from './namespace';
import { Random } from 'meteor/random';

// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
var startsWith = function(str, starts) {
  return (
    str.length >= starts.length && str.substring(0, starts.length) === starts
  );
};
var endsWith = function(str, ends) {
  return (
    str.length >= ends.length &&
    str.substring(str.length - ends.length) === ends
  );
};

// @param url {String} URL to Meteor app, eg:
//   "/" or "madewith.meteor.com" or "https://foo.meteor.com"
//   or "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"
// @returns {String} URL to the endpoint with the specific scheme and subPath, e.g.
// for scheme "http" and subPath "sockjs"
//   "http://subdomain.meteor.com/sockjs" or "/sockjs"
//   or "https://ddp--1234-foo.meteor.com/sockjs"
var translateUrl = function(url, newSchemeBase, subPath) {
  if (!newSchemeBase) {
    newSchemeBase = 'http';
  }

  var ddpUrlMatch = url.match(/^ddp(i?)\+sockjs:\/\//);
  var httpUrlMatch = url.match(/^http(s?):\/\//);
  var newScheme;
  if (ddpUrlMatch) {
    // Remove scheme and split off the host.
    var urlAfterDDP = url.substr(ddpUrlMatch[0].length);
    newScheme = ddpUrlMatch[1] === 'i' ? newSchemeBase : newSchemeBase + 's';
    var slashPos = urlAfterDDP.indexOf('/');
    var host = slashPos === -1 ? urlAfterDDP : urlAfterDDP.substr(0, slashPos);
    var rest = slashPos === -1 ? '' : urlAfterDDP.substr(slashPos);

    // In the host (ONLY!), change '*' characters into random digits. This
    // allows different stream connections to connect to different hostnames
    // and avoid browser per-hostname connection limits.
    host = host.replace(/\*/g, function() {
      return Math.floor(Random.fraction() * 10);
    });

    return newScheme + '://' + host + rest;
  } else if (httpUrlMatch) {
    newScheme = !httpUrlMatch[1] ? newSchemeBase : newSchemeBase + 's';
    var urlAfterHttp = url.substr(httpUrlMatch[0].length);
    url = newScheme + '://' + urlAfterHttp;
  }

  // Prefix FQDNs but not relative URLs
  if (url.indexOf('://') === -1 && !startsWith(url, '/')) {
    url = newSchemeBase + '://' + url;
  }

  // XXX This is not what we should be doing: if I have a site
  // deployed at "/foo", then DDP.connect("/") should actually connect
  // to "/", not to "/foo". "/" is an absolute path. (Contrast: if
  // deployed at "/foo", it would be reasonable for DDP.connect("bar")
  // to connect to "/foo/bar").
  //
  // We should make this properly honor absolute paths rather than
  // forcing the path to be relative to the site root. Simultaneously,
  // we should set DDP_DEFAULT_CONNECTION_URL to include the site
  // root. See also client_convenience.js #RationalizingRelativeDDPURLs
  url = Meteor._relativeToSiteRootUrl(url);

  if (endsWith(url, '/')) return url + subPath;
  else return url + '/' + subPath;
};

export function toSockjsUrl(url) {
  return translateUrl(url, 'http', 'sockjs');
}

export function toWebsocketUrl(url) {
  var ret = translateUrl(url, 'ws', 'websocket');
  return ret;
}

LivedataTest.toSockjsUrl = toSockjsUrl;
