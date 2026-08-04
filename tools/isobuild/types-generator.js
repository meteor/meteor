/**
 * types-generator.js
 *
 * Generates .meteor/local/types/packages.d.ts so that TypeScript apps can
 * resolve `import { X } from 'meteor/package-name'` and sub-path imports like
 * `import { Y } from 'meteor/package-name/sub-path'`.
 *
 * Priority order for resolving a package's type entry:
 *   1. isopack.typesEntry  (set via api.types() in package.js)
 *   2. package-types.json  resource in the isopack
 *   3. A single .d.ts resource in the isopack
 */

"use strict";

import * as files from "../fs/files";

const TYPES_DIR = "types";
const PACKAGES_SUBDIR = "packages";
const PACKAGES_DTS = "packages.d.ts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate type declarations for all packages in the app and write them to
 * .meteor/local/types/.
 *
 * @param {Object} options
 * @param {Object} options.isopackCache  - The IsopackCache (fully built)
 * @param {Object} options.packageMap    - The PackageMap
 * @param {string} options.projectLocalDir - e.g. /app/.meteor/local
 */
export async function generateTypes({
  isopackCache,
  packageMap,
  projectLocalDir,
}) {
  const typesDir = files.pathJoin(projectLocalDir, TYPES_DIR);
  const packagesTypesDir = files.pathJoin(typesDir, PACKAGES_SUBDIR);

  files.mkdir_p(packagesTypesDir);

  // Collect entries: { name, normalizedName, dtsPath (relative to typesDir) }
  const entries = [];

  await packageMap.eachPackage(async (name) => {
    let isopack;
    try {
      isopack = isopackCache.getIsopack(name);
    } catch (_) {
      // Package not yet built / not available – skip silently
      return;
    }

    const info = findTypesInfo(isopack);
    if (!info) return;

    const normalizedName = normalizePackageName(name);

    // Write main .d.ts
    const mainFileName = `${normalizedName}.d.ts`;
    const mainAbsPath = files.pathJoin(packagesTypesDir, mainFileName);
    if (info.data) {
      const wrappedMain = wrapDeclareModule(`meteor/${name}`, info.data);
      writeIfChanged(mainAbsPath, Buffer.from(wrappedMain, "utf8"));
    } else {
      // No content found – skip this package
      return;
    }

    const entry = {
      name,
      normalizedName,
      mainRelPath: `${PACKAGES_SUBDIR}/${mainFileName}`,
      subModules: [],
    };

    // Write sub-path module .d.ts files (issue #10 fix)
    if (info.modules) {
      for (const [moduleName, moduleData] of Object.entries(info.modules)) {
        if (!moduleData) continue;
        const moduleFileName = `${normalizedName}__${normalizePackageName(
          moduleName
        )}.d.ts`;
        const moduleAbsPath = files.pathJoin(packagesTypesDir, moduleFileName);
        const wrappedModule = wrapDeclareModule(
          `meteor/${name}/${moduleName}`,
          moduleData
        );
        writeIfChanged(moduleAbsPath, Buffer.from(wrappedModule, "utf8"));
        entry.subModules.push({
          name: moduleName,
          relPath: `${PACKAGES_SUBDIR}/${moduleFileName}`,
        });
      }
    }

    entries.push(entry);
  });

  const declaration = generatePackagesDeclaration(entries);
  writeIfChanged(
    files.pathJoin(typesDir, PACKAGES_DTS),
    Buffer.from(declaration, "utf8")
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find type information for an isopack.
 * Returns { data: Buffer, modules: Map<string, Buffer|null>|null } or null.
 */
function findTypesInfo(isopack) {
  // Priority 1: api.types() was called – typesEntry is set on the isopack
  if (isopack.typesEntry) {
    const data = findResourceData(isopack, isopack.typesEntry);
    if (!data) return null;

    let modules = null;
    if (isopack.typesModules) {
      modules = {};
      for (const [key, filePath] of Object.entries(isopack.typesModules)) {
        modules[key] = findResourceData(isopack, filePath);
      }
    }
    return { data, modules };
  }

  // Priority 2: package-types.json resource (backward compatibility)
  const packageTypesResource = findResourceByPath(
    isopack,
    "package-types.json"
  );
  if (packageTypesResource) {
    let config;
    try {
      config = JSON.parse(packageTypesResource.data.toString("utf8"));
    } catch (_) {
      config = null;
    }
    if (config && config.typesEntry) {
      const data = findResourceData(isopack, config.typesEntry);
      if (data) {
        let modules = null;
        if (config.modules) {
          modules = {};
          for (const [key, filePath] of Object.entries(config.modules)) {
            modules[key] = findResourceData(isopack, filePath);
          }
        }
        return { data, modules };
      }
    }
  }

  // Priority 3: single .d.ts resource in the isopack
  const dtsResources = findAllDtsResources(isopack);
  if (dtsResources.length === 1) {
    return { data: dtsResources[0].data, modules: null };
  }

  return null;
}

/**
 * Normalize a resource path: strip a leading `./` so that paths from
 * package-types.json (which may be `"./module/foo.d.ts"`) match how
 * isobuild stores them after the `pathRelative(".", p)` normalization
 * in package-api.js (which strips the leading `./`).
 */
function normalizeResourcePath(p) {
  return p && p.startsWith("./") ? p.slice(2) : p;
}

/**
 * Find a resource by its `path` field across all unibuilds.
 */
function findResourceByPath(isopack, resourcePath) {
  const normalized = normalizeResourcePath(resourcePath);
  for (const unibuild of isopack.unibuilds) {
    for (const resource of unibuild.resources) {
      if (normalizeResourcePath(resource.path) === normalized) {
        return resource;
      }
    }
  }
  return null;
}

/**
 * Find the data Buffer for a resource with the given path.
 */
function findResourceData(isopack, resourcePath) {
  const resource = findResourceByPath(isopack, resourcePath);
  return resource && resource.data instanceof Buffer ? resource.data : null;
}

/**
 * Find all .d.ts resources in the isopack (deduped by path).
 */
function findAllDtsResources(isopack) {
  const seen = new Set();
  const results = [];
  for (const unibuild of isopack.unibuilds) {
    for (const resource of unibuild.resources) {
      if (
        resource.path &&
        resource.path.endsWith(".d.ts") &&
        resource.data instanceof Buffer &&
        !seen.has(resource.path)
      ) {
        seen.add(resource.path);
        results.push(resource);
      }
    }
  }
  return results;
}

/**
 * Replace colons with underscores and slashes with double-underscores
 * so the name is safe as a filename on all platforms (including Windows,
 * where colons are forbidden in file names).
 *
 * Examples:
 *   'random'              → 'random'
 *   'accounts-base'       → 'accounts-base'
 *   'author:package'      → 'author_package'
 */
function normalizePackageName(name) {
  return name.replace(/:/g, "_").replace(/\//g, "__");
}

/**
 * Generate the packages.d.ts content — a list of triple-slash reference
 * directives pointing to the per-package .d.ts files.  Each per-package file
 * already contains the `declare module 'meteor/…' { … }` wrapper so we never
 * need relative imports inside an ambient module block (which TypeScript
 * forbids with: "Import or export declaration in an ambient module declaration
 * cannot reference module through relative module name").
 */
function generatePackagesDeclaration(entries) {
  let content =
    "// This file is auto-generated by Meteor. Do not edit manually.\n";
  content += "// Re-run `meteor run` or `meteor build` to regenerate.\n\n";

  for (const entry of entries) {
    content += `/// <reference path="./${entry.mainRelPath}" />\n`;
    for (const sub of entry.subModules) {
      content += `/// <reference path="./${sub.relPath}" />\n`;
    }
  }

  return content;
}

/**
 * Matches a top-level ambient module declaration such as
 * `declare module 'meteor/random' {` or `declare module "foo";`.
 * Anchored to the start of a line so occurrences inside comments that are
 * indented, or inside nested blocks, are unlikely to match.
 */
const DECLARE_MODULE_RE = /^\s*declare\s+module\s+['"]/m;

/**
 * True when a .d.ts file already contains its own ambient module
 * declaration(s).  Packages written for zodern:types typically ship files
 * like `declare module 'meteor/pkg' { … }`; those must be used verbatim,
 * because ambient module declarations cannot be nested — wrapping them in
 * another `declare module` block would be a TypeScript syntax error.
 */
function hasOwnModuleDeclaration(body) {
  return DECLARE_MODULE_RE.test(body);
}

/**
 * Produce the final content for a per-package declaration file.
 *
 * If the source file already declares its own ambient module(s) (the
 * zodern:types convention), it is emitted verbatim.  Otherwise the file is
 * assumed to be a plain module-style declaration file (top-level
 * imports/exports, like `accounts-base.d.ts`, or exported namespaces, like
 * `random.d.ts`) and is wrapped in a `declare module` block.  Both exported
 * namespaces and non-relative `import` statements are valid inside an
 * ambient module block, so wrapping is safe for those files; only relative
 * imports are not, and those cannot resolve from a generated location
 * anyway.
 *
 * @param {string} meteorModuleName  e.g. 'meteor/random' or 'meteor/rmd/hooks'
 * @param {Buffer|string} content    raw declaration file content
 * @returns {string}
 */
function wrapDeclareModule(meteorModuleName, content) {
  const body = (
    Buffer.isBuffer(content) ? content.toString("utf8") : content
  ).trim();

  if (hasOwnModuleDeclaration(body)) {
    return `${body}\n`;
  }

  const indented = body
    .split("\n")
    .map((line) => (line.length ? "  " + line : ""))
    .join("\n");
  return `declare module '${meteorModuleName}' {\n${indented}\n}\n`;
}

/**
 * Write data to a file only if the contents have changed, to avoid
 * unnecessary TypeScript invalidation.
 */
function writeIfChanged(absPath, data) {
  try {
    const existing = files.readFile(absPath);
    if (existing.equals(data)) return;
  } catch (_) {
    // File doesn't exist yet – fall through to write
  }
  files.writeFile(absPath, data);
}
