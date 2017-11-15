"use strict";

const assert = require("assert");
const { readFileSync } = require("fs");
const {
  join: pathJoin,
  normalize: pathNormalize,
} = require("path");
const hasOwn = Object.prototype.hasOwnProperty;

const { WebApp } = require("meteor/webapp");

require("./security.js");
require("./client.js");

Object.keys(dynamicImportInfo).forEach(platform => {
  const info = dynamicImportInfo[platform];
  if (info.dynamicRoot) {
    info.dynamicRoot = pathNormalize(info.dynamicRoot);
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
        "web.browser"
      )));
    });
  }
);

function readTree(tree, platform) {
  const pathParts = [];

  function walk(node) {
    if (node && typeof node === "object") {
      Object.keys(node).forEach(name => {
        pathParts.push(name);
        node[name] = walk(node[name]);
        assert.strictEqual(pathParts.pop(), name);
      });
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
    throw new Meteor.Error("bad dynamic module path");
  }

  const cache = getCache(platform);
  return hasOwn.call(cache, absPath)
    ? cache[absPath]
    : cache[absPath] = readFileSync(absPath, "utf8");
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
