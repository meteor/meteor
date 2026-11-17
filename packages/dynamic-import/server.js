"use strict";

const { readFileSync } = require("fs");
const {
  join: pathJoin,
  normalize: pathNormalize,
} = require("path");
const { fetchURL } = require("./common.js");
const { Meteor } = require("meteor/meteor");
const hasOwn = Object.prototype.hasOwnProperty;

const {
  MAX_REQUEST_BYTES, MAX_TREE_DEPTH, MAX_TREE_NODES,
  MAX_KEYS_PER_OBJECT, MAX_KEY_BYTES, MAX_PATH_BYTES,
} = require("./request-limits.js");

// Bound failed reads and log once per request.
const MAX_FAILED_READS = 100;

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
    response.setHeader('Allow', 'OPTIONS, POST');
    response.setHeader('Content-Length', '0');
    response.setHeader(
      "Access-Control-Allow-Headers",
      typeof acrh === "string" ? acrh : "*"
    );
    response.setHeader("Access-Control-Allow-Methods", "POST");
    response.end();

  } else if (request.method === "POST") {
    const chunks = [];
    let requestBytes = 0;
    let rejected = false;

    const rejectOversizedRequest = () => {
      if (rejected) return;
      rejected = true;
      chunks.length = 0;
      response.writeHead(413, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      });
      response.end(JSON.stringify("request too large"));
    };

    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      rejectOversizedRequest();
      request.resume();
      return;
    }

    request.on("data", chunk => {
      if (rejected) return;
      requestBytes += Buffer.byteLength(chunk);
      if (requestBytes > MAX_REQUEST_BYTES) {
        rejectOversizedRequest();
      } else {
        chunks.push(chunk);
      }
    });
    request.on("aborted", () => {
      chunks.length = 0;
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        const requestTree = JSON.parse(Buffer.concat(chunks));
        validateTree(requestTree);
        const tree = JSON.stringify(readTree(
          requestTree,
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
    const body = `method ${request.method} not allowed`;
    response.writeHead(405, {
      Allow: "OPTIONS, POST",
      'Content-Length': Buffer.byteLength(body),
      "Cache-Control": "no-cache"
    });
    response.end(body);
  }
}

function validateTree(tree) {
  const stack = [{ node: tree, depth: 0, pathBytes: 0 }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const { node, depth, pathBytes } = stack.pop();
    nodeCount += 1;
    if (nodeCount > MAX_TREE_NODES) {
      throw new Error("dynamic import tree has too many nodes");
    }
    if (depth > MAX_TREE_DEPTH) {
      throw new Error("dynamic import tree is too deeply nested");
    }

    if (node === 1) {
      if (depth === 0) {
        throw new Error("dynamic import tree root must be an object");
      }
      continue;
    }
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("dynamic import tree leaves must equal 1");
    }

    const keys = Object.keys(node);
    if (keys.length > MAX_KEYS_PER_OBJECT) {
      throw new Error("dynamic import tree object has too many keys");
    }

    keys.forEach(name => {
      const keyBytes = Buffer.byteLength(name);
      if (
        name.length === 0 ||
        name === "." ||
        name === ".." ||
        name.includes("\0") ||
        name.includes("/") ||
        name.includes("\\")
      ) {
        throw new Error("invalid dynamic import path component");
      }
      if (keyBytes > MAX_KEY_BYTES) {
        throw new Error("dynamic import path component is too long");
      }

      const childPathBytes = pathBytes + (depth > 0 ? 1 : 0) + keyBytes;
      if (childPathBytes > MAX_PATH_BYTES) {
        throw new Error("dynamic import path is too long");
      }
      stack.push({
        node: node[name],
        depth: depth + 1,
        pathBytes: childPathBytes
      });
    });
  }
}

function getPlatform(request) {
  // If the __dynamicImport request includes a secret key, and it matches
  // dynamicImportInfo[platform].key, use platform instead of the default
  // platform, web.browser.
  const secretKey = request.query.key;
  if (typeof secretKey === "string") {
    for (const p of Object.keys(dynamicImportInfo)) {
      if (secretKey === dynamicImportInfo[p].key) {
        return p;
      }
    }
  }

  return Package.webapp.WebApp.categorizeRequest(request).arch;
}

function readTree(tree, platform) {
  let result = null;
  const failures = { count: 0, skipped: 0, firstError: null };
  const stack = [{
    node: tree,
    pathParts: [],
    parent: null,
    key: null,
    visited: false
  }];

  const assignResult = (frame, value) => {
    if (frame.parent === null) {
      result = value;
    } else if (value === null) {
      delete frame.parent[frame.key];
    } else {
      frame.parent[frame.key] = value;
    }
  };

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame.node === 1) {
      assignResult(frame, read(frame.pathParts, platform, failures));
      continue;
    }

    if (!frame.visited) {
      frame.visited = true;
      frame.keys = Object.keys(frame.node);
      stack.push(frame);
      for (let index = frame.keys.length - 1; index >= 0; index -= 1) {
        const name = frame.keys[index];
        stack.push({
          node: frame.node[name],
          pathParts: frame.pathParts.concat(name),
          parent: frame.node,
          key: name,
          visited: false
        });
      }
      continue;
    }

    const empty = frame.keys.every(name => !hasOwn.call(frame.node, name));
    assignResult(frame, empty ? null : frame.node);
  }

  if (failures.count > 0) {
    console.error(
      `dynamic-import: failed to read ${failures.count} requested module(s)` +
        (failures.skipped > 0
          ? ` and skipped ${failures.skipped} more after ${MAX_FAILED_READS} failures`
          : "") +
        "; first error:",
      failures.firstError.stack || failures.firstError
    );
  }

  return result;
}

function read(pathParts, platform, failures) {
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

  if (failures.count >= MAX_FAILED_READS) {
    failures.skipped += 1;
    return null;
  }

  try {
    return cache[absPath] = readFileSync(absPath, "utf8");
  } catch (e) {
    failures.count += 1;
    failures.firstError = failures.firstError || e;
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
