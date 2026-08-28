"use strict";

const files = require("../fs/files");

const DECLARATION_FILE_PATTERN = /\.d\.ts(?:\.map)?$/;

/**
 * Make directory-mode declaration files an explicit part of a package source
 * bundle instead of relying on their incidental presence in isopack watch
 * sets. Returns package-root-relative, standard-format paths.
 */
function addTypeDeclarationSources({
  packageDir,
  typesDir,
  typesEntry,
  typesModules,
  sourceFiles,
  fileSystem = files,
}) {
  if (!typesDir) {
    return {
      ok: true,
      declarationSources: [],
      sourceFiles: [...sourceFiles],
    };
  }

  const absoluteTypesDir = fileSystem.pathResolve(packageDir, typesDir);
  if (!fileSystem.containsPath(packageDir, absoluteTypesDir)) {
    return {
      ok: false,
      error:
        `api.types(): declaration directory "${typesDir}" resolves outside ` +
        "the package root.",
    };
  }

  const declarationSources = [];

  const visit = (absoluteDir) => {
    for (const entry of fileSystem.readdirWithTypes(absoluteDir)) {
      const absolutePath = fileSystem.pathJoin(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && DECLARATION_FILE_PATTERN.test(entry.name)) {
        declarationSources.push(
          fileSystem.convertToStandardPath(
            fileSystem.pathRelative(packageDir, absolutePath)
          )
        );
      }
    }
  };

  try {
    visit(absoluteTypesDir);
  } catch (error) {
    return {
      ok: false,
      error:
        `api.types(): declaration directory "${typesDir}" is missing or ` +
        `unreadable: ${error.message}`,
    };
  }

  declarationSources.sort();
  if (!declarationSources.some((path) => path.endsWith(".d.ts"))) {
    return {
      ok: false,
      error:
        `api.types(): declaration directory "${typesDir}" contains no ` +
        ".d.ts files.",
    };
  }

  const expectedDeclarations = Array.from(
    new Set(
      [typesEntry, ...Object.values(typesModules || {})]
        .filter(Boolean)
        .map((path) => fileSystem.convertToStandardPath(path.replace(/^\.\//, ""))),
    ),
  );
  const declarationSet = new Set(declarationSources);
  const missingDeclarations = expectedDeclarations.filter((path) => !declarationSet.has(path));
  if (missingDeclarations.length > 0) {
    return {
      ok: false,
      error:
        `api.types(): declaration directory "${typesDir}" is missing expected files: ` +
        `${missingDeclarations.join(", ")}.`,
    };
  }

  return {
    ok: true,
    declarationSources,
    sourceFiles: Array.from(new Set([...sourceFiles, ...declarationSources])),
  };
}

module.exports = { addTypeDeclarationSources };
