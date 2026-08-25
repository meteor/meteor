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
 *                                       bare-specifier stub in directory and
 *                                       ts-src modes)
 *         <normalizedModuleKey>.d.ts   (one per sub-path module)
 *         <typesDir>/                  (directory mode only: verbatim copy of
 *                                       the package's declaration folder,
 *                                       tree preserved, under its original name)
 *         src/                         (ts-src mode only: verbatim copy of the
 *                                       package's TypeScript sources)
 *         node_modules -> <isopackRoot>/npm/node_modules   (only when it exists)
 *     node_modules/
 *       meteor-package-types -> ../packages   (only when a package uses
 *                                              directory or ts-src mode)
 *
 * The node_modules symlink lets TypeScript resolve `import ... from
 * 'some-npm-pkg'` statements inside a package's declaration files against the
 * npm dependencies bundled with that package's isopack.  The generated .d.ts
 * files are real files (not reached through a symlink), so normal Node-style
 * resolution walks up from them and follows the sibling node_modules symlink —
 * no `preserveSymlinks` compiler option is needed for that first hop.  (One
 * known limitation: TypeScript realpaths the resolved bundled dep into the
 * isopack, so imports inside THAT dep's typings of packages not bundled with
 * the isopack — peer deps like react, app-only @types — cannot reach the
 * app's node_modules for published/tropohouse packages unless the app sets
 * preserveSymlinks: true; see the using-core-types docs.)
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
 * ts-src mode (api.types('index.ts'), a TypeScript-AUTHORED package): during
 * local development there are no declaration files at all — `meteor publish`
 * generates them with tsc and rewrites the package to directory mode, but a
 * locally used package is consumed straight from its sources.  The package's
 * TypeScript source resources are copied verbatim under src/ (tree
 * preserved) and bridged with the same bare-specifier stubs as directory
 * mode; the extensionless require resolves to .ts/.tsx, which TypeScript
 * type-checks fine for implementation files:
 *
 *   declare module 'meteor/my-package' {
 *     import exports = require('meteor-package-types/my-package/src/index');
 *     export = exports;
 *   }
 *
 * Priority order for resolving a package's type entry:
 *   1. isopack.typesDir + typesEntry  (directory form of api.types())
 *      or isopack.typesEntry alone    (single-file or .ts form of api.types())
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
// ts-src mode: the package's TypeScript sources are copied under this
// subdirectory of the per-package output dir.
const SRC_SUBDIR = "src";

/**
 * True for a TypeScript SOURCE entry (.ts/.tsx but not .d.ts) — the marker
 * of a TypeScript-authored package (api.types('index.ts')).  Shared with
 * the publish command, which generates real declarations from such an entry
 * with tsc before building.
 */
export function isTypeScriptSourceEntry(p) {
  return typeof p === "string" && /\.tsx?$/.test(p) && !p.endsWith(".d.ts");
}

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

  // Pin the whole generated tree to CommonJS module-format classification.
  // Without this, moduleResolution node16/nodenext classifies every
  // generated file by the NEAREST package.json — the app's own — so an app
  // with `"type": "module"` would see the stubs' `export =` and the copied
  // trees' extensionless relative imports as ESM errors (or, with
  // skipLibCheck, silently degrade the imported types to `any`).  The
  // copied trees can only contain .ts/.tsx/.d.ts/.d.ts.map files, so this
  // manifest can never be shadowed by package content.
  writeIfChanged(
    files.pathJoin(typesDir, "package.json"),
    Buffer.from('{\n  "type": "commonjs"\n}\n', "utf8")
  );

  // Collect entries: { name, normalizedName, mainRelPath, subModules,
  // keepNames, copiedFiles }
  const entries = [];

  // Whether any package used the directory or .ts form of api.types(): the
  // stubs of those packages resolve through the meteor-package-types symlink.
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
    if (!info.mode && !info.data) {
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
      // packageDir-relative paths of every file written into a copied
      // tree (directory/ts-src modes); removeStaleOutput prunes files
      // inside the kept trees that are not in this set.
      copiedFiles: null,
    };

    if (info.mode === "dir") {
      needsPackageTypesLink = true;
      writeTypesDirPackage({ name, normalizedName, packageDir, info, entry });
    } else if (info.mode === "ts-src") {
      needsPackageTypesLink = true;
      writeTsSourcePackage({ name, normalizedName, packageDir, info, entry });
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

  // removeStaleOutput must not delete the copied folder — but it prunes
  // files inside it that are no longer among the package's declarations.
  entry.keepNames.push(info.dir.split("/")[0]);
  entry.copiedFiles = filePaths;

  // Stub for the main module.  The specifier uses the NORMALIZED package
  // name (a ':' cannot appear in a Windows path); 'meteor/author:pkg'
  // appears only in the declare-module id.  Extensionless so resolution
  // finds the .d.ts under node10/node16/bundler alike.
  //
  // When the entry file carries its own ambient `declare module` blocks
  // (the zodern:types convention), it is a script, not a module: the
  // stub's require() cannot resolve it (TS2306), and the stub's
  // `export =` would merge into the same ambient module id and clobber
  // the entry's real exports (TS2305 on every app-side import).  Such an
  // entry gets a triple-slash reference shim instead — the referenced
  // file loads verbatim and its own declare-module blocks provide the
  // `meteor/...` module ids, mirroring writeSingleFilePackage's verbatim
  // path.
  const entryNoExt = info.entry.replace(/\.d\.ts$/, "");
  writeIfChanged(
    files.pathJoin(packageDir, MAIN_DTS),
    Buffer.from(
      isAmbientResource(info.files, info.entry)
        ? makeReferenceShim(info.entry)
        : makeBareSpecifierStub(
            `meteor/${name}`,
            `${PACKAGE_TYPES_LINK_NAME}/${normalizedName}/${entryNoExt}`
          ),
      "utf8"
    )
  );

  // Stubs for sub-path modules (reference shims when the module file
  // declares its own ambient modules — same rule as the entry).
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
          isAmbientResource(info.files, normalizedModulePath)
            ? makeReferenceShim(normalizedModulePath)
            : makeBareSpecifierStub(
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
 * True when the resource at `relPath` (already normalized) exists among
 * `resources` and carries its own ambient `declare module` blocks.
 */
function isAmbientResource(resources, relPath) {
  const resource = resources.find(
    (r) => normalizeResourcePath(r.path) === relPath
  );
  return !!resource && hasOwnModuleDeclaration(resource.data.toString("utf8"));
}

/**
 * A shim that loads a copied declaration file verbatim: used instead of the
 * bare-specifier stub when the target file declares its own ambient
 * modules (an ambient-only .d.ts is a script — not a module — so it cannot
 * be require()d, and its declare-module blocks only load when the file
 * itself is part of the program).  The path is relative to the shim's own
 * location in packages/<normalizedName>/.
 */
function makeReferenceShim(relPath) {
  return `/// <reference path="./${relPath}" />\n`;
}

/**
 * Write the output for a TypeScript-authored package (api.types('index.ts')):
 * the package ships no declaration files during local development, so its
 * TypeScript source resources — collected from the isopack Buffers, original
 * relPaths preserved — are copied verbatim under src/ and the `meteor/...`
 * module ids are bridged with the same bare-specifier stubs as directory
 * mode:
 *
 *   packages/<normalizedName>/
 *     index.d.ts            (stub: declare module 'meteor/<name>')
 *     <module>.d.ts         (stub per sub-path module)
 *     src/…                 (verbatim copy of the .ts/.tsx/.d.ts sources)
 *
 * The stub's require() is extensionless, so TypeScript resolves it to the
 * copied .ts/.tsx file and type-checks the implementation directly (the
 * zodern:types precedent).  `meteor publish` never produces this mode: it
 * generates real declarations with tsc and rewrites the package to
 * directory mode before building, so published packages are consumed as
 * plain declaration folders.
 */
function writeTsSourcePackage({ name, normalizedName, packageDir, info, entry }) {
  const filePaths = new Set();
  const copiedFiles = new Set();
  for (const resource of info.files) {
    const relPath = normalizeResourcePath(resource.path);
    filePaths.add(relPath);
    copiedFiles.add(`${SRC_SUBDIR}/${relPath}`);
    const absPath = files.pathJoin(packageDir, SRC_SUBDIR, relPath);
    files.mkdir_p(files.pathDirname(absPath));
    writeIfChanged(absPath, withTsNocheckBanner(relPath, resource.data));
  }

  // removeStaleOutput must not delete the copied sources — but it prunes
  // files inside src/ that are no longer among the package's sources.
  entry.keepNames.push(SRC_SUBDIR);
  entry.copiedFiles = copiedFiles;

  // Stub for the main module.  The specifier uses the NORMALIZED package
  // name (a ':' cannot appear in a Windows path) and strips only the
  // trailing .ts/.tsx extension, so resolution finds the copied source.
  const entryNoExt = stripTypeScriptExtension(info.entry);
  writeIfChanged(
    files.pathJoin(packageDir, MAIN_DTS),
    Buffer.from(
      makeBareSpecifierStub(
        `meteor/${name}`,
        `${PACKAGE_TYPES_LINK_NAME}/${normalizedName}/${SRC_SUBDIR}/${entryNoExt}`
      ),
      "utf8"
    )
  );

  // Stubs for sub-path modules.
  if (info.modules) {
    for (const [moduleName, modulePath] of Object.entries(info.modules)) {
      const normalizedModulePath = normalizeResourcePath(modulePath);
      if (!filePaths.has(normalizedModulePath)) {
        Console.debug(
          `[types] Skipping sub-path module "${moduleName}" of "${name}": ` +
            `"${modulePath}" is not among the package's TypeScript sources`
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
      const moduleNoExt = stripTypeScriptExtension(normalizedModulePath);
      writeIfChanged(
        files.pathJoin(packageDir, moduleFileName),
        Buffer.from(
          makeBareSpecifierStub(
            `meteor/${name}/${moduleName}`,
            `${PACKAGE_TYPES_LINK_NAME}/${normalizedName}/${SRC_SUBDIR}/${moduleNoExt}`
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
 * Strip exactly one trailing TypeScript extension (.ts or .tsx — which also
 * covers a trailing .d.ts, whose remaining `.d` re-resolves to the same
 * file).  Anchored to the end of the string: a `.ts` occurring mid-path
 * (e.g. `a.ts.helpers/b.ts`) is never touched.
 */
function stripTypeScriptExtension(p) {
  return p.replace(/\.tsx?$/, "");
}

// The copied .ts/.tsx implementation sources are type-checked as part of
// the consuming APP's program with the APP's compiler flags — skipLibCheck
// only exempts .d.ts files — so a package that is clean under its own
// (possibly laxer) tsconfig could fail every consumer's typecheck (e.g.
// noUnusedLocals).  A leading `// @ts-nocheck` suppresses semantic
// diagnostics inside the copied file while its exports still carry full
// inferred types to consumers.
const TS_NOCHECK_BANNER = "// @ts-nocheck\n";
const TS_NOCHECK_RE = /^\/\/\s*@ts-nocheck/;

/**
 * Prepend `// @ts-nocheck` to a copied implementation source (.ts/.tsx but
 * not .d.ts).  Declaration files are returned verbatim — skipLibCheck
 * already governs those.  A leading UTF-8 BOM is stripped so the directive
 * stays on line 1, and files that already start with the directive are
 * left alone.
 */
function withTsNocheckBanner(relPath, data) {
  if (!isTypeScriptSourceEntry(relPath)) {
    return data;
  }
  let body = data;
  if (
    body.length >= 3 &&
    body[0] === 0xef &&
    body[1] === 0xbb &&
    body[2] === 0xbf
  ) {
    body = body.slice(3);
  }
  if (TS_NOCHECK_RE.test(body.toString("utf8", 0, Math.min(body.length, 32)))) {
    return body;
  }
  return Buffer.concat([Buffer.from(TS_NOCHECK_BANNER, "utf8"), body]);
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
 *  - stale files inside the copied dir/ts-src trees (declarations or
 *    sources that vanished from the current isopack), plus directories
 *    left empty by that pruning,
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
    // Directory/ts-src mode: the copied tree must survive (its contents
    // are pruned recursively below).
    const copiedTrees = new Set(entry.keepNames || []);
    for (const keepName of copiedTrees) {
      keep.add(keepName);
    }
    expectedByDir.set(entry.normalizedName, {
      keep,
      copiedTrees,
      copiedFiles: entry.copiedFiles || new Set(),
    });
  }

  let dirEntries;
  try {
    dirEntries = files.readdir(packagesTypesDir);
  } catch (_) {
    return;
  }

  for (const entryName of dirEntries) {
    const absPath = files.pathJoin(packagesTypesDir, entryName);

    const expected = expectedByDir.get(entryName);
    if (expected) {
      // Current package: prune files we no longer generate.
      let inner;
      try {
        inner = files.readdir(absPath);
      } catch (_) {
        continue;
      }
      for (const fileName of inner) {
        if (!expected.keep.has(fileName)) {
          await files.rm_recursive(files.pathJoin(absPath, fileName));
          Console.debug(
            `[types] Removed stale file ${entryName}/${fileName}`
          );
        } else if (expected.copiedTrees.has(fileName)) {
          // Copied dir/ts-src tree: the writers only add/overwrite the
          // current isopack's files, so anything else in the tree is a
          // leftover from a previous package version.
          await pruneCopiedTree(
            entryName,
            absPath,
            fileName,
            expected.copiedFiles
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
 * Recursively prune a copied tree (directory mode's declaration folder or
 * ts-src mode's src/) under packages/<pkg>/: unlink files whose
 * packageDir-relative path is not among the paths written for the current
 * isopack, and remove directories left empty by the pruning.  Never
 * follows symlinks (a symlink dirent reports isDirectory() === false).
 * Returns the number of surviving entries so callers can drop emptied
 * directories; the tree root itself is always kept.
 */
async function pruneCopiedTree(pkgName, packageDir, relDir, copiedFiles) {
  const absDir = files.pathJoin(packageDir, relDir);
  let dirents;
  try {
    dirents = files.readdirWithTypes(absDir);
  } catch (_) {
    return 0;
  }
  let surviving = 0;
  for (const dirent of dirents) {
    const relPath = `${relDir}/${dirent.name}`;
    const absPath = files.pathJoin(absDir, dirent.name);
    if (dirent.isDirectory()) {
      const kept = await pruneCopiedTree(
        pkgName,
        packageDir,
        relPath,
        copiedFiles
      );
      if (kept === 0) {
        await files.rm_recursive(absPath);
        Console.debug(
          `[types] Removed stale directory ${pkgName}/${relPath}`
        );
      } else {
        surviving += 1;
      }
    } else if (!copiedFiles.has(relPath)) {
      files.unlink(absPath);
      Console.debug(`[types] Removed stale file ${pkgName}/${relPath}`);
    } else {
      surviving += 1;
    }
  }
  return surviving;
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

  // Priority 1 (TypeScript-authored form): api.types('index.ts') was called
  // with a .ts/.tsx source entry.  During local development the package has
  // no declaration files at all, so its TypeScript source resources are
  // consumed directly (copied under src/ and reached through bare-specifier
  // stubs).  `meteor publish` never produces an isopack in this state: it
  // runs tsc and rewrites the package to directory mode before building.
  if (isTypeScriptSourceEntry(isopack.typesEntry) && !isopack.typesDir) {
    const entry = normalizeResourcePath(isopack.typesEntry);
    const fileResources = findTypeScriptSourceResources(isopack);
    if (
      !fileResources.some(
        (resource) => normalizeResourcePath(resource.path) === entry
      )
    ) {
      // A warning, not debug: `meteor publish` only checks that the entry
      // exists on disk, so this misconfiguration publishes fine while
      // every local consumer silently gets no types — make the skip
      // visible so the author can tell why.
      Console.warn(
        `[types] Package "${name}" declares api.types("${entry}") but the ` +
          "entry is not one of its compiled sources (add it with " +
          "api.mainModule() or api.addFiles()); skipping type generation " +
          "for it."
      );
      return null;
    }
    return {
      mode: "ts-src",
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
 * Find all TypeScript file resources (.ts/.tsx, which includes .d.ts) of the
 * isopack, deduped by path across unibuilds.  Both source resources (the
 * compiled .ts/.tsx files) and asset resources (declaration files an author
 * may have registered) are collected: declaration files can be imported by
 * the sources, so they must ride along for the copied tree to type-check.
 * TypeScript-authored entries are registered as compiled sources, which are
 * present on the os unibuild for server code — but scanning every unibuild
 * keeps this robust (and picks up client-only sources), mirroring
 * findAssetResourcesUnder.
 */
function findTypeScriptSourceResources(isopack) {
  const seen = new Set();
  const results = [];
  for (const unibuild of isopack.unibuilds) {
    for (const resource of unibuild.resources) {
      const path = resource.path && normalizeResourcePath(resource.path);
      if (
        (resource.type === "source" || resource.type === "asset") &&
        path &&
        /\.tsx?$/.test(path) &&
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
