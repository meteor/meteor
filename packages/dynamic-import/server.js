"use strict";

const assert = require("assert");
const { readFileSync } = require("fs");
const {
  join: pathJoin,
  normalize: pathNormalize,
} = require("path");
const { fetchURL } = require("./common.js");
const { Meteor } = require("meteor/meteor");
const { isModern } = require("meteor/modern-browsers");
const hasOwn = Object.prototype.hasOwnProperty;

require("./security.js");

const client = require("./client.js");

Meteor.startup(() => {
  if (! Package.webapp) {
    // If the webapp package is not in use, there's no way for the
    // dynamic-import package to fetch dynamic modules, so we should
    // abandon the rest of the logic in this module.
    //
    // If api.use("webapp") appeared in dynamic-import/package.js, then
    // Package.webapp would always be defined here, of course, but that
    // would be a bad idea, because the dynamic-import package should not
    // single-handedly force a dependency on webapp if the program does
    // not otherwise need a web server (e.g., when the program is an
    // isopacket or build plugin instead of a web application).
    //
    // Note that the client.js module (imported above) still defines
    // Module.prototype.dynamicImport, which will work as long as no
    // modules need to be fetched.
    return;
  }

  Object.keys(dynamicImportInfo).forEach(setUpPlatform);

  Package.webapp.WebAppInternals.meteorInternalHandlers.use(
    fetchURL,
    middleware
  );
});

function setUpPlatform(platform) {
  const info = dynamicImportInfo[platform];

  if (info.dynamicRoot) {
    info.dynamicRoot = pathNormalize(info.dynamicRoot);
  }

  if (platform === "server") {
    client.setSecretKey(info.key = randomId(40));
  }
}

function randomId(n) {
  let s = "";
  while (s.length < n) {
    s += Math.random().toString(36).slice(2);
  }
  return s.slice(0, n);
}

function middleware(request, response) {
  // Allow dynamic import() requests from any origin.
  response.setHeader("Access-Control-Allow-Origin", "*");

  if (request.method === "OPTIONS") {
    const acrh = request.headers["access-control-request-headers"];
    response.setHeader(
      "Access-Control-Allow-Headers",
      typeof acrh === "string" ? acrh : "*"
    );
    response.setHeader("Access-Control-Allow-Methods", "POST");
    response.end();

  } else if (request.method === "POST") {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      try {
        const tree = JSON.stringify(readTree(
          JSON.parse(Buffer.concat(chunks)),
          getPlatform(request)
        ), null, 2);

        response.writeHead(200, {
          "Content-Type": "application/json"
        });

        response.end(tree);

      } catch (e) {
        response.writeHead(400, {
          "Content-Type": "application/json"
        });

        response.end(JSON.stringify(
          Meteor.isDevelopment && e.message || "bad request"
        ));
      }
    });

  } else {
    response.writeHead(405, {
      "Cache-Control": "no-cache"
    });

    response.end(`method ${request.method} not allowed`);
  }
}

function getPlatform(request) {
  const { identifyBrowser } = Package.webapp.WebAppInternals;
  const browser = identifyBrowser(request.headers["user-agent"]);
  let platform = isModern(browser)
    ? "web.browser"
    : "web.browser.legacy";

  // If the __dynamicImport request includes a secret key, and it matches
  // dynamicImportInfo[platform].key, use platform instead of the default
  // platform, web.browser.
  const secretKey = request.query.key;

  if (typeof secretKey === "string") {
    Object.keys(dynamicImportInfo).some(p => {
      if (secretKey === dynamicImportInfo[p].key) {
        platform = p;
        return true;
      }
    });
  }

  return platform;
}

function readTree(tree, platform) {
  const pathParts = [];

  function walk(node) {
    if (! node) {
      return null;
    }

    if (typeof node !== "object") {
      return read(pathParts, platform);
    }

    let empty = true;

    Object.keys(node).forEach(name => {
      pathParts.push(name);
      const result = walk(node[name]);
      if (result === null) {
        // If the read function returns null, omit this module from the
        // resulting tree.
        delete node[name];
      } else {
        node[name] = result;
        empty = false;
      }
      assert.strictEqual(pathParts.pop(), name);
    });

    if (empty) {
      // If every recursive call to walk(node[name]) returned null,
      // remove this node from the resulting tree by returning null.
      return null;
    }

    return node;
  }

  return walk(tree);
}

function read(pathParts, platform) {
  const { dynamicRoot } = dynamicImportInfo[platform];
  const absPath = pathNormalize(pathJoin(
    dynamicRoot,
    pathJoin(...pathParts).replace(/:/g, "_")
  ));

  if (! absPath.startsWith(dynamicRoot)) {
    console.error("bad dynamic import path:", absPath);
    return null;
  }

  const cache = getCache(platform);
  if (hasOwn.call(cache, absPath)) {
    return cache[absPath];
  }

  try {
    return cache[absPath] = readFileSync(absPath, "utf8");
  } catch (e) {
    console.error(e.stack || e);
    return null;
  }
}

const cachesByPlatform = Object.create(null);
function getCache(platform) {
  return hasOwn.call(cachesByPlatform, platform)
    ? cachesByPlatform[platform]
    : cachesByPlatform[platform] = Object.create(null);
}

const { onMessage } = require("meteor/inter-process-messaging");

onMessage("client-refresh", () => {
  // The caches for the web.browser[.legacy] platforms need to be
  // discarded whenever a client-only refresh occurs, so the new client
  // bundle does not fetch stale module data from dynamic import(). This
  // message is sent by tools/runners/run-app.js and also consumed by the
  // autoupdate package.
  Object.keys(cachesByPlatform).forEach(platform => {
    delete cachesByPlatform[platform];
  });
});
