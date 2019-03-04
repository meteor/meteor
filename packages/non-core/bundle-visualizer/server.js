import assert from "assert";
import { readFileSync as fsReadFileSync } from "fs";

import { Meteor } from "meteor/meteor";
import { WebAppInternals } from "meteor/webapp";

import {
  methodNameStats,
  packageName,
  typeBundle,
  typeNodeModules,
  typePackage,
} from "./common.js";

if (Meteor.isProduction) {
  console.warn([
    `=> The "${packageName}" package is currently enabled. Visit your`,
    "application in a web browser to view the client bundle analysis and",
    "'meteor remove' the package before building/deploying the final bundle.",
  ].join(" "));
} else {
  console.warn([
    "=> In order to provide accurate measurements using minified bundles,",
    `the "${packageName}" package requires running 'meteor --production'`,
    "to simulate production bundling."
  ].join(" "));
}

function getStatBundles() {
  const statFileFilter = f =>
    f.type === "json" &&
    f.absolutePath &&
    f.absolutePath.endsWith(".stats.json");

  // Read the stat file, but if it's in any way unusable just return null.
  function readOrNull(file) {
    try {
      return JSON.parse(fsReadFileSync(file, "utf8"));
    } catch (err) {
      return null;
    }
  }

  const {
    staticFiles,
    staticFilesByArch,
  } = WebAppInternals;

  const files = [];

  if (staticFilesByArch) {
    Object.keys(staticFilesByArch).forEach(arch => {
      const staticFiles = staticFilesByArch[arch];
      Object.keys(staticFiles).forEach(path => {
        files.push({ ...staticFiles[path], arch });
      });
    });
  } else if (staticFiles) {
    Object.keys(staticFiles).forEach(path => {
      files.push({ ...staticFiles[path], arch: 'bundle' });
    });
  }

  return files.filter(statFileFilter).map(file => ({
    name: file.hash,
    arch: file.arch,
    stats: readOrNull(file.absolutePath),
  }));
}

function _childModules(node) {
  return Object.keys(node)
    .map(module => {
      const result = {
        name: module,
        type: typeNodeModules,
      };

      if (typeof node[module] === "object") {
        result.children = _childModules(node[module]);
      } else {
        result.size = node[module];
      }

      return result;
    });
}

function d3TreeFromStats(stats) {
  assert.strictEqual(typeof stats, "object",
    "Must pass a stats object");
  assert.strictEqual(typeof stats.minifiedBytesByPackage, "object",
    "Stats object must contain a `minifiedBytesByPackage` object");

  const sizeOrDetail = (name, node) => {
    const result = {
      name,
      type: typePackage,
    };

    // A non-leaf is: [size (Number), limb (Object)]
    // A leaf is size (Number)
    if (Array.isArray(node)) {
      const [, detail] = node;
      result.children = _childModules(detail);
    } else {
      result.size = node;
    }

    return result;
  };

  // Main entry into the stats is the `minifiedBytesByPackage` attribute.
  return Object.keys(stats.minifiedBytesByPackage)
    .map(name =>
      sizeOrDetail(name
        // Change the "packages/bundle.js" name to "(bundle)"
        .replace(/^[^\/]+\/(.*)\.js$/, "($1)"),
          stats.minifiedBytesByPackage[name]));
}

Meteor.startup(() => {
  if (! Package.webapp) {
    return;
  }

  Package.webapp.WebAppInternals.meteorInternalHandlers.use(
    methodNameStats,
    statsMiddleware
  );
});

function statsMiddleware(request, response) {
  const statBundles = getStatBundles();

  function sendJSON(data) {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(data, null, 2));
  }

  // Silently return no data if not simulating production.
  if (! Meteor.isProduction) {
    return sendJSON(null);
  }

  if (! (statBundles && statBundles.length)) {
    throw new Meteor.Error(
      "no-stats-bundles",
      "Unable to retrieve stats"
    );
  }

  sendJSON({
    name: "main",
    children: statBundles.map((statBundle, index, array) => ({
      name: statBundle.arch,
      type: typeBundle,
      children: d3TreeFromStats(statBundle.stats),
    }))
  });
}
