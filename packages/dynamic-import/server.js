"use strict";

const assert = require("assert");
const { readFileSync } = require("fs");
const {
  join: pathJoin,
  normalize: pathNormalize,
} = require("path");
const hasOwn = Object.prototype.hasOwnProperty;

const { WebApp } = require("meteor/webapp");
const { Random } = require("meteor/random");

require("./security.js");

const client = require("./client.js");
const platforms = Object.keys(dynamicImportInfo);

platforms.forEach(platform => {
  const info = dynamicImportInfo[platform];

  if (info.dynamicRoot) {
    info.dynamicRoot = pathNormalize(info.dynamicRoot);
  }

  if (platform === "server") {
    client.setSecretKey(info.key = Random.id(40));
  }
});

WebApp.connectHandlers.use(
  "/__dynamicImport",
  function (request, response) {
    assert.strictEqual(request.method, "POST");
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(readTree(
        JSON.parse(Buffer.concat(chunks)),
        getPlatform(request)
      )));
    });
  }
);

function getPlatform(request) {
  let platform = "web.browser";

  // If the __dynamicImport request includes a secret key, and it matches
  // dynamicImportInfo[platform].key, use platform instead of the default
  // platform, web.browser.
  const secretKey = request.query.key;

  if (typeof secretKey === "string") {
    platforms.some(p => {
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
    if (node && typeof node === "object") {
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
    } else {
      return read(pathParts, platform);
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

process.on("message", msg => {
  // The cache for the "web.browser" platform needs to be discarded
  // whenever a client-only refresh occurs, so that new client code does
  // not receive stale module data from __dynamicImport. This code handles
  // the same message listened for by the autoupdate package.
  if (msg && msg.refresh === "client") {
    delete cachesByPlatform["web.browser"];
  }
});
