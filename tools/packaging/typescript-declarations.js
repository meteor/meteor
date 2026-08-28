"use strict";

const files = require("../fs/files");

const TYPES_BUILD_DIR = ".types-build";

function normalizeSourcePath(sourcePath) {
  return sourcePath.replace(/^\.\//, "");
}

function declarationPathForSource(
  sourcePath,
  typesBuildDir = TYPES_BUILD_DIR
) {
  return (
    typesBuildDir +
    "/" +
    normalizeSourcePath(sourcePath).replace(/\.tsx?$/, "") +
    ".d.ts"
  );
}

/**
 * Validate declarations emitted by the initial publish and rewrite a
 * PackageSource to directory mode. The mutation is atomic: callers never see
 * metadata that points at a partially populated declaration directory.
 */
function usePrebuiltTypeScriptDeclarations(
  packageSource,
  packageDir,
  typesBuildDir = TYPES_BUILD_DIR
) {
  const entry = normalizeSourcePath(packageSource.typesEntry);
  const rewrittenEntry = declarationPathForSource(entry, typesBuildDir);
  const rewrittenModules = packageSource.typesModules ? {} : null;
  const missing = [];

  const checkDeclaration = (label, sourcePath, declarationPath) => {
    if (!files.exists(files.pathJoin(packageDir, declarationPath))) {
      missing.push({
        label,
        sourcePath: normalizeSourcePath(sourcePath),
        declarationPath,
      });
    }
  };

  checkDeclaration("entry", entry, rewrittenEntry);

  if (packageSource.typesModules) {
    Object.entries(packageSource.typesModules).forEach(
      ([moduleName, modulePath]) => {
        const declarationPath = declarationPathForSource(
          modulePath,
          typesBuildDir
        );
        rewrittenModules[moduleName] = declarationPath;
        checkDeclaration(
          `modules.${moduleName}`,
          modulePath,
          declarationPath
        );
      }
    );
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  packageSource.typesDir = typesBuildDir;
  packageSource.typesEntry = rewrittenEntry;
  if (rewrittenModules) {
    packageSource.typesModules = rewrittenModules;
  }

  return { ok: true, missing: [] };
}

module.exports = {
  TYPES_BUILD_DIR,
  declarationPathForSource,
  usePrebuiltTypeScriptDeclarations,
};
