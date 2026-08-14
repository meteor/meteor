/**
 * types-generator.js
 *
 * Generates .meteor/types/packages.d.ts so that TypeScript apps can
 * resolve `import { X } from 'meteor/package-name'` and sub-path imports like
 * `import { Y } from 'meteor/package-name/sub-path'`.
 *
 * Output layout (one directory per package):
 *
 *   .meteor/types/
 *     .gitignore
 *     packages.d.ts                    (barrel of /// <reference> directives)
 *     packages/
 *       <normalizedName>/
 *         index.d.ts                   (main module declaration, or a
 *                                       bare-specifier stub in directory mode)
 *         <normalizedModuleKey>.d.ts   (one per sub-path module)
 *         <typesDir>/                  (directory mode only: verbatim copy of
 *                                       the package's declaration folder,
 *                                       tree preserved, under its original name)
 *         node_modules -> <isopackRoot>/npm/node_modules   (only when it exists)
 *     node_modules/
 *       meteor-package-types -> ../packages   (only when a package uses
 *                                              directory mode)
 *
 * The node_modules symlink lets TypeScript resolve `import ... from
 * 'some-npm-pkg'` statements inside a package's declaration files against the
 * npm dependencies bundled with that package's isopack.  The generated .d.ts
 * files are real files (not reached through a symlink), so normal Node-style
 * resolution walks up from them and follows the sibling node_modules symlink —
 * no `preserveSymlinks` compiler option is needed.
 *
 * Directory mode (api.types('dist-types/')): the folder's declaration files
 * reference each other with relative imports, which are forbidden inside an
 * ambient `declare module` block — so they cannot be wrapped.  Instead the
 * folder is copied verbatim and the `meteor/...` module ids are bridged with
 * stubs whose BARE specifier (valid in ambient blocks) resolves node-style
 * through the meteor-package-types symlink at the types root:
 *
 *   declare module 'meteor/react-meteor-data' {
 *     import exports = require('meteor-package-types/react-meteor-data/dist-types/server/main');
 *     export = exports;
 *   }
 *
 * Priority order for resolving a package's type entry:
 *   1. isopack.typesDir + typesEntry  (directory form of api.types())
 *      or isopack.typesEntry alone    (single-file api.types())
 *   2. package-types.json  resource in the isopack
 *   3. A single .d.ts resource in the isopack
 */

"use strict";

import * as files from "../fs/files";
import { Console } from "../console/console.js";

const TYPES_DIR = "types";
const PACKAGES_SUBDIR = "packages";
const PACKAGES_DTS = "packages.d.ts";
const MAIN_DTS = "index.d.ts";
const NPM_LINK_NAME = "node_modules";
const PACKAGE_TYPES_LINK_NAME = "meteor-package-types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate type declarations for all packages in the app and write them to
 * .meteor/types/.
 *
 * @param {Object} options
 * @param {Object} options.isopackCache  - The IsopackCache (fully built)
 * @param {Object} options.packageMap    - The PackageMap
 * @param {string} options.projectMeteorDir - e.g. /app/.meteor
 */
export async function generateTypes({
  isopackCache,
  packageMap,
  projectMeteorDir,
}) {
  const typesDir = files.pathJoin(projectMeteorDir, TYPES_DIR);
  const packagesTypesDir = files.pathJoin(typesDir, PACKAGES_SUBDIR);

  files.mkdir_p(packagesTypesDir);

  // Keep the generated output untracked in every app: `.meteor/.gitignore`
  // only ignores `local`, so the types dir needs its own .gitignore.
  writeIfChanged(
    files.pathJoin(typesDir, ".gitignore"),
    Buffer.from("*\n", "utf8")
  );

  // Collect entries: { name, normalizedName, mainRelPath, subModules,
  // keepNames, extraRefs }
  const entries = [];

  // Whether any package used the directory form of api.types(): the stubs
  // of those packages resolve through the meteor-package-types symlink.
  let needsPackageTypesLink = false;

  await packageMap.eachPackage(async (name) => {
    let isopack;
    try {
      isopack = isopackCache.getIsopack(name);
    } catch (_) {
      // Defensive: in the normal build pipeline every mapped package has been
      // built before this stage runs, so this should be unreachable — but
      // generateTypes must not let one unloadable package (e.g. from a
      // subset-built cache) kill types for every other package.
      Console.debug(`[types] Skipping "${name}": isopack not available`);
      return;
    }

    const info = findTypesInfo(isopack, name);
    if (!info) return;
    if (info.mode !== "dir" && !info.data) {
      // No content found – skip this package
      return;
    }

    const normalizedName = normalizePackageName(name);
    const packageDir = files.pathJoin(packagesTypesDir, normalizedName);
    files.mkdir_p(packageDir);

    const entry = {
      name,
      normalizedName,
      mainRelPath: `${PACKAGES_SUBDIR}/${normalizedName}/${MAIN_DTS}`,
      subModules: [],
      // Extra names inside packageDir that removeStaleOutput must keep
      // (directory mode: the copied declaration folder).
      keepNames: [],
      // Extra /// <reference> paths for packages.d.ts (directory mode:
      // an entry file carrying its own ambient declare-module blocks).
      extraRefs: [],
    };

    if (info.mode === "dir") {
      needsPackageTypesLink = true;
      writeTypesDirPackage({ name, normalizedName, packageDir, info, entry });
    } else {
      writeSingleFilePackage({ name, packageDir, info, entry });
    }

    // Make the package's bundled npm dependencies resolvable from its
    // declaration files.
    await ensureNpmDepsSymlink(isopack, packageDir, name);

    entries.push(entry);
  });

  if (needsPackageTypesLink) {
    await ensurePackageTypesLink(typesDir, packagesTypesDir);
  }

  await removeStaleOutput(packagesTypesDir, entries);

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
 * Write the output for a single-file package (api.types('foo.d.ts'),
 * package-types.json, or the auto-detected single .d.ts): the entry file —
 * and each sub-path module file — wrapped in a `declare module 'meteor/…'`
 * block (unless it already declares its own ambient modules).
 */
function writeSingleFilePackage({ name, packageDir, info, entry }) {
  // Write main .d.ts
  const wrappedMain = wrapDeclareModule(`meteor/${name}`, info.data);
  writeIfChanged(
    files.pathJoin(packageDir, MAIN_DTS),
    Buffer.from(wrappedMain, "utf8")
  );

  // Write sub-path module .d.ts files (issue #10 fix)
  if (info.modules) {
    for (const [moduleName, moduleData] of Object.entries(info.modules)) {
      if (!moduleData) continue;
      const moduleFileName = `${normalizePackageName(moduleName)}.d.ts`;
      if (moduleFileName === MAIN_DTS) {
        // A sub-path module literally named "index" would collide with the
        // package's own entry file.  Degenerate case; skip it.
        Console.debug(
          `[types] Skipping sub-path module "${moduleName}" of "${name}": ` +
            `filename collides with ${MAIN_DTS}`
        );
        continue;
      }
      const moduleAbsPath = files.pathJoin(packageDir, moduleFileName);
      const wrappedModule = wrapDeclareModule(
        `meteor/${name}/${moduleName}`,
        moduleData
      );
      writeIfChanged(moduleAbsPath, Buffer.from(wrappedModule, "utf8"));
      entry.subModules.push({
        name: moduleName,
        fileName: moduleFileName,
        relPath: `${PACKAGES_SUBDIR}/${entry.normalizedName}/${moduleFileName}`,
      });
    }
  }
}

/**
 * Write the output for a directory-mode package (api.types('dist-types/')):
 * the declaration folder is copied verbatim — tree preserved, from the
 * isopack's asset resource Buffers, NOT from the on-disk isopack, whose
 * generated filenames are mangled — under the package's output directory,
 * and the `meteor/...` module ids are bridged with bare-specifier stubs:
 *
 *   packages/<normalizedName>/
 *     index.d.ts            (stub: declare module 'meteor/<name>')
 *     <module>.d.ts         (stub per sub-path module)
 *     <typesDir>/…          (verbatim copy of the declaration folder, kept
 *                            under its original name so a root index.d.ts
 *                            inside it cannot collide with the stub)
 *
 * Relative specifiers are invalid inside an ambient module declaration, but
 * bare specifiers are not: `require('meteor-package-types/…')` resolves
 * node-style through the symlink created by ensurePackageTypesLink.  The
 * copied files are real files reached without wrapping, so their internal
 * relative imports resolve naturally.
 */
function writeTypesDirPackage({ name, normalizedName, packageDir, info, entry }) {
  const filePaths = new Set();
  for (const resource of info.files) {
    const relPath = normalizeResourcePath(resource.path);
    filePaths.add(relPath);
    const absPath = files.pathJoin(packageDir, relPath);
    files.mkdir_p(files.pathDirname(absPath));
    writeIfChanged(absPath, resource.data);
  }

  // removeStaleOutput must not delete the copied folder.
  entry.keepNames.push(info.dir.split("/")[0]);

  // Stub for the main module.  The specifier uses the NORMALIZED package
  // name (a ':' cannot appear in a Windows path); 'meteor/author:pkg'
  // appears only in the declare-module id.  Extensionless so resolution
  // finds the .d.ts under node10/node16/bundler alike.
  const entryNoExt = info.entry.replace(/\.d\.ts$/, "");
  writeIfChanged(
    files.pathJoin(packageDir, MAIN_DTS),
    Buffer.from(
      makeBareSpecifierStub(
        `meteor/${name}`,
        `${PACKAGE_TYPES_LINK_NAME}/${normalizedName}/${entryNoExt}`
      ),
      "utf8"
    )
  );

  // If the entry file carries its own ambient `declare module` blocks,
  // those only load when the file itself is referenced — the stub's
  // require() does not surface them.  Reference it from packages.d.ts too.
  const entryResource = info.files.find(
    (resource) => normalizeResourcePath(resource.path) === info.entry
  );
  if (
    entryResource &&
    hasOwnModuleDeclaration(entryResource.data.toString("utf8"))
  ) {
    entry.extraRefs.push(`${PACKAGES_SUBDIR}/${normalizedName}/${info.entry}`);
  }

  // Stubs for sub-path modules.
  if (info.modules) {
    for (const [moduleName, modulePath] of Object.entries(info.modules)) {
      const normalizedModulePath = normalizeResourcePath(modulePath);
      if (!filePaths.has(normalizedModulePath)) {
        Console.debug(
          `[types] Skipping sub-path module "${moduleName}" of "${name}": ` +
            `"${modulePath}" is not among the package's declaration files`
        );
        continue;
      }
      const moduleFileName = `${normalizePackageName(moduleName)}.d.ts`;
      if (moduleFileName === MAIN_DTS) {
        // A sub-path module literally named "index" would collide with the
        // package's stub.  Degenerate case; skip it.
        Console.debug(
          `[types] Skipping sub-path module "${moduleName}" of "${name}": ` +
            `filename collides with ${MAIN_DTS}`
        );
        continue;
      }
      const moduleNoExt = normalizedModulePath.replace(/\.d\.ts$/, "");
      writeIfChanged(
        files.pathJoin(packageDir, moduleFileName),
        Buffer.from(
          makeBareSpecifierStub(
            `meteor/${name}/${moduleName}`,
            `${PACKAGE_TYPES_LINK_NAME}/${normalizedName}/${moduleNoExt}`
          ),
          "utf8"
        )
      );
      entry.subModules.push({
        name: moduleName,
        fileName: moduleFileName,
        relPath: `${PACKAGES_SUBDIR}/${normalizedName}/${moduleFileName}`,
      });
    }
  }
}

/**
 * A stub that exposes a real declaration file (reached through the
 * meteor-package-types symlink) under a `meteor/...` module id.
 * `import exports = require(...)` + `export = exports` mirrors the target
 * module's shape exactly (default export included) regardless of
 * esModuleInterop.
 */
function makeBareSpecifierStub(meteorModuleName, bareSpecifier) {
  return (
    `declare module '${meteorModuleName}' {\n` +
    `  import exports = require('${bareSpecifier}');\n` +
    `  export = exports;\n` +
    `}\n`
  );
}

/**
 * Normalize a symlink target for comparison, mirroring the normalization in
 * files.symlinkWithOverwrite (OS-specific separators, no trailing slash).
 */
function normalizeLinkTarget(p) {
  return files.convertToOSPath(p).replace(/[\/\\]+$/, "");
}

/**
 * Describe what currently exists at a would-be symlink path.
 * Returns { exists: boolean, target: string|null } where target is non-null
 * only when the path is a symlink.
 */
function readLinkStatus(linkPath) {
  let st;
  try {
    st = files.lstat(linkPath);
  } catch (_) {
    return { exists: false, target: null };
  }
  if (!st.isSymbolicLink()) {
    return { exists: true, target: null };
  }
  try {
    return { exists: true, target: files.readlink(linkPath) };
  } catch (_) {
    return { exists: true, target: null };
  }
}

/**
 * Create (or fix up) the `node_modules` symlink inside a generated package
 * directory, pointing at the isopack's bundled npm dependencies
 * (`<isopackRoot>/npm/node_modules`).  files.symlinkWithOverwrite creates a
 * junction-style directory link on Windows, which does not require admin
 * rights, and replaces an existing wrong-target link, file, or directory.
 *
 * isopack.isopackPath is recorded by the IsopackCache when the isopack is
 * loaded from disk (versioned packages from the tropohouse, up-to-date local
 * packages from .meteor/local/isopacks) or saved after a fresh build — which
 * happens during the build stage, before type generation runs.  If it is
 * missing (e.g. a cache with no cacheDir), the symlink is simply skipped.
 */
async function ensureNpmDepsSymlink(isopack, packageDir, name) {
  const linkPath = files.pathJoin(packageDir, NPM_LINK_NAME);
  const isopackRoot = isopack.isopackPath;
  const npmDir =
    isopackRoot && files.pathJoin(isopackRoot, "npm", "node_modules");

  const existing = readLinkStatus(linkPath);

  if (!npmDir || !files.exists(npmDir)) {
    // This package bundles no npm dependencies: remove a leftover link so it
    // cannot dangle.
    if (existing.exists) {
      await files.rm_recursive(linkPath);
      Console.debug(`[types] Removed stale npm deps link for "${name}"`);
    }
    return;
  }

  if (
    existing.target !== null &&
    normalizeLinkTarget(existing.target) === normalizeLinkTarget(npmDir)
  ) {
    // Already points at the right place.
    return;
  }

  await files.symlinkWithOverwrite(npmDir, linkPath);
  Console.debug(
    existing.exists
      ? `[types] Replaced npm deps link for "${name}" -> ${npmDir}`
      : `[types] Linked npm deps for "${name}" -> ${npmDir}`
  );
}

/**
 * Create (or fix up) the `.meteor/types/node_modules/meteor-package-types`
 * symlink pointing at the sibling `packages/` directory.  Node-style
 * resolution of the bare `meteor-package-types/<pkg>/…` specifiers in the
 * directory-mode stubs walks up from packages/<pkg>/ and finds this link,
 * which turns the packages tree into a synthetic npm package — the same
 * battle-tested mechanism zodern:types shipped with.  Idempotent, with the
 * same readLinkStatus/symlinkWithOverwrite treatment as the npm deps link.
 */
async function ensurePackageTypesLink(typesDir, packagesTypesDir) {
  const nodeModulesDir = files.pathJoin(typesDir, NPM_LINK_NAME);
  files.mkdir_p(nodeModulesDir);
  const linkPath = files.pathJoin(nodeModulesDir, PACKAGE_TYPES_LINK_NAME);

  const existing = readLinkStatus(linkPath);
  if (
    existing.target !== null &&
    normalizeLinkTarget(existing.target) ===
      normalizeLinkTarget(packagesTypesDir)
  ) {
    // Already points at the right place.
    return;
  }

  await files.symlinkWithOverwrite(packagesTypesDir, linkPath);
  Console.debug(
    `[types] Linked ${PACKAGE_TYPES_LINK_NAME} -> ${packagesTypesDir}`
  );
}

/**
 * Remove output that no longer corresponds to the current set of packages:
 *
 *  - package directories under packages/ for packages that disappeared (or
 *    lost their types),
 *  - stale files inside kept package directories (e.g. a dropped sub-path
 *    module),
 *  - flat `<name>.d.ts` files directly under packages/ left behind by the
 *    pre-directory layout (one-time migration).
 */
async function removeStaleOutput(packagesTypesDir, entries) {
  const expectedByDir = new Map();
  for (const entry of entries) {
    const keep = new Set([MAIN_DTS, NPM_LINK_NAME]);
    for (const sub of entry.subModules) {
      keep.add(sub.fileName);
    }
    // Directory mode: the copied declaration folder must survive.
    for (const keepName of entry.keepNames || []) {
      keep.add(keepName);
    }
    expectedByDir.set(entry.normalizedName, keep);
  }

  let dirEntries;
  try {
    dirEntries = files.readdir(packagesTypesDir);
  } catch (_) {
    return;
  }

  for (const entryName of dirEntries) {
    const absPath = files.pathJoin(packagesTypesDir, entryName);

    const keep = expectedByDir.get(entryName);
    if (keep) {
      // Current package: prune files we no longer generate.
      let inner;
      try {
        inner = files.readdir(absPath);
      } catch (_) {
        continue;
      }
      for (const fileName of inner) {
        if (!keep.has(fileName)) {
          await files.rm_recursive(files.pathJoin(absPath, fileName));
          Console.debug(
            `[types] Removed stale file ${entryName}/${fileName}`
          );
        }
      }
      continue;
    }

    if (entryName.endsWith(".d.ts")) {
      // Flat file from the previous layout.
      files.unlink(absPath);
      Console.debug(`[types] Removed old flat-layout file ${entryName}`);
    } else {
      // Directory (or stray file) for a package that is gone.
      await files.rm_recursive(absPath);
      Console.debug(`[types] Removed stale package dir ${entryName}`);
    }
  }
}

/**
 * Find type information for an isopack.
 * Returns { data: Buffer, modules: Map<string, Buffer|null>|null } or null.
 */
function findTypesInfo(isopack, name) {
  // Priority 1 (directory form): api.types('dir/') was called – typesDir is
  // set on the isopack and the declaration files are asset resources under
  // it.  typesEntry/typesModules hold full package-root-relative paths.
  if (isopack.typesDir) {
    const dir = normalizeResourcePath(isopack.typesDir).replace(/\/+$/, "");
    const entry = isopack.typesEntry
      ? normalizeResourcePath(isopack.typesEntry)
      : null;
    const fileResources = findAssetResourcesUnder(isopack, `${dir}/`);
    if (!entry || fileResources.length === 0) {
      Console.debug(
        `[types] Skipping "${name}": no declaration files found under "${dir}/"`
      );
      return null;
    }
    if (
      !fileResources.some(
        (resource) => normalizeResourcePath(resource.path) === entry
      )
    ) {
      Console.debug(
        `[types] Skipping "${name}": types entry "${entry}" not found under "${dir}/"`
      );
      return null;
    }
    return {
      mode: "dir",
      dir,
      entry,
      files: fileResources,
      modules: isopack.typesModules || null,
    };
  }

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
    } catch (err) {
      Console.debug(
        `[types] Ignoring malformed package-types.json in package "${name}": ${err.message}`
      );
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
 * Find all asset resources whose (normalized) path lies inside the given
 * directory prefix (which must end with '/'), deduped by path across
 * unibuilds.  Directory-mode declaration files are registered as server
 * (os) arch assets, but scanning every unibuild keeps this robust.
 */
function findAssetResourcesUnder(isopack, dirPrefix) {
  const seen = new Set();
  const results = [];
  for (const unibuild of isopack.unibuilds) {
    for (const resource of unibuild.resources) {
      const path = resource.path && normalizeResourcePath(resource.path);
      if (
        resource.type === "asset" &&
        path &&
        path.startsWith(dirPrefix) &&
        resource.data instanceof Buffer &&
        !seen.has(path)
      ) {
        seen.add(path);
        results.push(resource);
      }
    }
  }
  return results;
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
 * Literal underscores are escaped first ('_' → '_u') so the mapping is
 * injective: without the escape, module keys 'a/b' and 'a__b' would both
 * normalize to 'a__b' and silently overwrite each other's file.  Package
 * names can never contain '_' or '/' (they are validated to [a-z0-9:.-]),
 * so their normalized filenames are unaffected by the escape.
 *
 * Examples:
 *   'random'              → 'random'
 *   'accounts-base'       → 'accounts-base'
 *   'author:package'      → 'author_package'
 *   'sub/path'            → 'sub__path'
 *   'a__b'                → 'a_u_ub'
 */
function normalizePackageName(name) {
  return name
    .replace(/_/g, "_u")
    .replace(/:/g, "_")
    .replace(/\//g, "__");
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
    // Directory mode: an entry file with its own ambient declare-module
    // blocks is additionally referenced directly, because those blocks only
    // load when the file itself is part of the program — the stub's
    // require() alone does not pull them in.
    for (const extraRef of entry.extraRefs || []) {
      content += `/// <reference path="./${extraRef}" />\n`;
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
