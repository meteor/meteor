import { Meteor } from 'meteor/meteor'
import { WebApp } from "meteor/webapp";
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let _disableSizeCheck = false;
let disabledBrowsers = {};
let enableCallback = null;

Meteor.AppCache = {
  config: options => {
    Object.keys(options).forEach(option => {
      value = options[option];
      if (option === 'browsers') {
        disabledBrowsers = {};
        value.each(browser => disabledBrowsers[browser] = false);
      }
      else if (option === 'onlineOnly') {
        value.forEach(urlPrefix =>
          RoutePolicy.declare(urlPrefix, 'static-online')
        );
      }
      else if (option === 'enableCallback') {
        enableCallback = value;
      }
      // option to suppress warnings for tests.
      else if (option === '_disableSizeCheck') {
        _disableSizeCheck = value;
      }
      else if (value === false) {
        disabledBrowsers[option] = true;
      }
      else if (value === true) {
        disabledBrowsers[option] = false;
      } else {
        throw new Error('Invalid AppCache config option: ' + option);
      }
    });
  }
};

const browserDisabled = request => {
  if (enableCallback) {
    return !enableCallback(request);
  }

  return disabledBrowsers[request.browser.name];
}

// Cache of previously computed app.manifest files.
const manifestCache = new Map;

const shouldSkip = resource =>
  resource.type === 'dynamic js' ||
    (resource.type === 'json' &&
     (resource.url.endsWith('.map') ||
      resource.url.endsWith('.stats.json?meteor_js_resource=true')));

WebApp.addHtmlAttributeHook(request =>
  browserDisabled(request) ?
    null :
    { manifest: "/app.manifest" }
);

WebApp.connectHandlers.use((req, res, next) => {
  if (req.url !== '/app.manifest') {
    return next();
  }

  const request = WebApp.categorizeRequest(req);

  // Browsers will get confused if we unconditionally serve the
  // manifest and then disable the app cache for that browser.  If
  // the app cache had previously been enabled for a browser, it
  // will continue to fetch the manifest as long as it's available,
  // even if we now are not including the manifest attribute in the
  // app HTML.  (Firefox for example will continue to display "this
  // website is asking to store data on your computer for offline
  // use").  Returning a 404 gets the browser to really turn off the
  // app cache.

  if (browserDisabled(request)) {
    res.writeHead(404);
    res.end();
    return;
  }

  const cacheInfo = {
    // Provided by WebApp.categorizeRequest.
    modern: request.modern,
  };

  // Also provided by WebApp.categorizeRequest.
  cacheInfo.arch = request.arch;

  // The true hash of the client manifest for this arch, regardless of
  // AUTOUPDATE_VERSION or Autoupdate.autoupdateVersion.
  cacheInfo.clientHash = WebApp.clientHash(cacheInfo.arch);

  if (Package.autoupdate) {
    const {
      // New in Meteor 1.7.1 (autoupdate@1.5.0), this versions object maps
      // client architectures (e.g. "web.browser") to client hashes that
      // reflect AUTOUPDATE_VERSION and Autoupdate.autoupdateVersion.
      versions,
      // The legacy way of forcing a particular version, supported here
      // just in case Autoupdate.versions is not defined.
      autoupdateVersion,
    } = Package.autoupdate.Autoupdate;

    const version = versions
      ? versions[cacheInfo.arch].version
      : autoupdateVersion;

    if (typeof version === "string" &&
        version !== cacheInfo.clientHash) {
      cacheInfo.autoupdateVersion = version;
    }
  }

  const cacheKey = JSON.stringify(cacheInfo);

  if (! manifestCache.has(cacheKey)) {
    manifestCache.set(cacheKey, computeManifest(cacheInfo));
  }

  const manifest = manifestCache.get(cacheKey);

  res.setHeader('Content-Type', 'text/cache-manifest');
  res.setHeader('Content-Length', manifest.length);

  return res.end(manifest);
});

function computeManifest(cacheInfo) {
  let manifest = "CACHE MANIFEST\n\n";

  // After the browser has downloaded the app files from the server and
  // has populated the browser's application cache, the browser will
  // *only* connect to the server and reload the application if the
  // *contents* of the app manifest file has changed.
  //
  // So to ensure that the client updates if client resources change,
  // include a hash of client resources in the manifest.
  manifest += `# ${cacheInfo.clientHash}\n`;

  // When using the autoupdate package, also include
  // AUTOUPDATE_VERSION.  Otherwise the client will get into an
  // infinite loop of reloads when the browser doesn't fetch the new
  // app HTML which contains the new version, and autoupdate will
  // reload again trying to get the new code.
  if (typeof cacheInfo.autoupdateVersion === "string") {
    manifest += `# ${cacheInfo.autoupdateVersion}\n`;
  }

  manifest += "\n";

  manifest += "CACHE:\n";
  manifest += "/\n";

  eachResource(cacheInfo, resource => {
    const { url } = resource;

    if (resource.where !== 'client' ||
        RoutePolicy.classify(url) ||
        shouldSkip(resource)) {
      return;
    }

    manifest += url;

    // If the resource is not already cacheable (has a query parameter,
    // presumably with a hash or version of some sort), put a version with
    // a hash in the cache.
    //
    // Avoid putting a non-cacheable asset into the cache, otherwise the
    // user can't modify the asset until the cache headers expire.
    if (! resource.cacheable) {
      manifest += `?${resource.hash}`;
    }

    manifest += "\n";
  });
  manifest += "\n";

  manifest += "FALLBACK:\n";
  manifest += "/ /\n";
  eachResource(cacheInfo, (resource, arch, prefix) => {
    const { url } = resource;

    if (resource.where !== 'client' ||
        RoutePolicy.classify(url) ||
        shouldSkip(resource)) {
      return;
    }

    if (! resource.cacheable) {
      // Add a fallback entry for each uncacheable asset we added above.
      //
      // This means requests for the bare url ("/image.png" instead of
      // "/image.png?hash") will work offline. Online, however, the
      // browser will send a request to the server. Users can remove this
      // extra request to the server and have the asset served from cache
      // by specifying the full URL with hash in their code (manually,
      // with some sort of URL rewriting helper)
      manifest += `${url} ${url}?${resource.hash}\n`;
    }

    if (resource.type === 'asset' &&
        prefix.length > 0 &&
        url.startsWith(prefix)) {
      // If the URL has a prefix like /__browser.legacy or /__cordova, add
      // a fallback from the un-prefixed URL to the fully prefixed URL, so
      // that legacy/cordova browsers can load assets offline without
      // using an explicit prefix. When the client is online, these assets
      // will simply come from the modern web.browser bundle, which does
      // not prefix its asset URLs. Using a fallback rather than just
      // duplicating the resources in the manifest is important because of
      // appcache size limits.
      manifest += `${url.slice(prefix.length)} ${url}?${resource.hash}\n`;
    }
  });

  manifest += "\n";

  manifest += "NETWORK:\n";
  // TODO adding the manifest file to NETWORK should be unnecessary?
  // Want more testing to be sure.
  manifest += "/app.manifest\n";
  [
    ...RoutePolicy.urlPrefixesFor('network'),
    ...RoutePolicy.urlPrefixesFor('static-online')
  ].forEach(urlPrefix => manifest += `${urlPrefix}\n`);
  manifest += "*\n";

  // content length needs to be based on bytes
  return Buffer.from(manifest, "utf8");
}

function eachResource({
  modern,
  arch,
}, callback) {
  const manifest = WebApp.clientPrograms[arch].manifest;

  let prefix = "";
  if (! modern) {
    manifest.some(({ url }) => {
      if (url && url.startsWith("/__")) {
        prefix = url.split("/", 2).join("/");
        return true;
      }
    });
  }

  manifest.forEach(resource => {
    callback(resource, arch, prefix);
  });
}

function sizeCheck() {
  const RESOURCE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
  const largeSizes = [ // Check size of each known architecture independently.
    "web.browser",
    "web.browser.legacy",
  ].filter((arch) => !!WebApp.clientPrograms[arch])
  .map((arch) => {
    let totalSize = 0;

    WebApp.clientPrograms[arch].manifest.forEach(resource => {
      if (resource.where === 'client' &&
          ! RoutePolicy.classify(resource.url) &&
          ! shouldSkip(resource)) {
        totalSize += resource.size;
      }
    });

    return {
      arch,
      size: totalSize,
    }
  })
  .filter(({ size }) => size > RESOURCE_SIZE_LIMIT);

  if (largeSizes.length > 0) {
    Meteor._debug([
      "** You are using the appcache package, but the size of",
      "** one or more of your cached resources is larger than",
      "** the recommended maximum size of 5MB which may break",
      "** your app in some browsers!",
      "** ",
      ...largeSizes.map(data => `** ${data.arch}: ${(data.size / 1024 / 1024).toFixed(1)}MB`),
      "** ",
      "** See http://docs.meteor.com/#appcache for more",
      "** information and fixes."
    ].join("\n"));
  }
}

// Run the size check after user code has had a chance to run. That way,
// the size check can take into account files that the user does not
// want cached. Otherwise, the size check warning will still print even
// if the user excludes their large files with
// `Meteor.AppCache.config({onlineOnly: files})`.
Meteor.startup(() => _disableSizeCheck || sizeCheck());
