const fs = require('fs');
const path = require('path');
const { createIgnoreRegex, createIgnoreGlobConfig } = require("./ignore.js");

// Normalize a path to always use forward slashes (POSIX style).
// Module identifiers in bundled JS must use '/' regardless of OS.
const toPosix = (p) => p.replace(/\\/g, '/');

/**
 * Generates eager test files dynamically
 * @param {Object} options - Options for generating the test file
 * @param {boolean} options.isAppTest - Whether this is an app test
 * @param {string} options.projectDir - The project directory
 * @param {string} options.buildContext - The build context
 * @param {string[]} options.ignoreEntries - Array of ignore patterns
 * @param {string[]} options.meteorIgnoreEntries - Array of meteor ignore patterns
 * @param {string} options.extraEntry - Extra entry to load
 * @returns {string} The path to the generated file
 */
const generateEagerTestFile = ({
  isAppTest,
  projectDir,
  buildContext,
  ignoreEntries: inIgnoreEntries = [],
  meteorIgnoreEntries: inMeteorIgnoreEntries = [],
  prefix: inPrefix = '',
  extraEntry,
  globalImportPath,
}) => {
  const distDir = path.resolve(projectDir, ".meteor/local/test");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Combine all ignore entries
  const ignoreEntries = [
    "**/node_modules/**",
    "**/.meteor/**",
    "**/public/**",
    "**/private/**",
    `**/${buildContext}/**`,
    ...inIgnoreEntries,
  ];

  // Create regex from ignore entries
  const excludeFoldersRegex = createIgnoreRegex(
    createIgnoreGlobConfig(ignoreEntries)
  );
  // Create regex from meteor ignore entries
  const excludeMeteorIgnoreRegex = inMeteorIgnoreEntries.length > 0
    ? createIgnoreRegex(createIgnoreGlobConfig(inMeteorIgnoreEntries))
    : null;

  const prefix = (inPrefix && `${inPrefix}-`) || "";
  const filename = isAppTest
    ? `${prefix}eager-app-tests.mjs`
    : `${prefix}eager-tests.mjs`;
  const filePath = path.resolve(distDir, filename);
  const regExp = isAppTest
    ? "/\\.app-(?:test|spec)s?\\.[^.]+$/"
    : "/\\.(?:test|spec)s?\\.[^.]+$/";

  const content = `${
    globalImportPath ? `import '${toPosix(globalImportPath)}';\n\n` : ""
  }${
    excludeMeteorIgnoreRegex
      ? `const MeteorIgnoreRegex = ${excludeMeteorIgnoreRegex.toString()};`
      : ""
  }
{
  const ctx = import.meta.webpackContext('${toPosix(projectDir)}', {
    recursive: true,
    regExp: ${regExp},
    exclude: ${excludeFoldersRegex.toString()},
    mode: 'eager',
  });
  ctx.keys().filter((k) => {
    ${
      excludeMeteorIgnoreRegex
        ? `// Only exclude based on *relative* path segments.
    return !MeteorIgnoreRegex.test(k);`
        : "return true;"
    }
  }).forEach(ctx);
  ${
    extraEntry
      ? `const extra = import.meta.webpackContext('${toPosix(path.dirname(
          extraEntry
        ))}', {
    recursive: false,
    regExp: ${new RegExp(`${path.basename(extraEntry)}$`).toString()},
    mode: 'eager',
  });
  extra.keys().forEach(extra);`
      : ""
  }
}`;

  fs.writeFileSync(filePath, content);
  return filePath;
};

module.exports = {
  generateEagerTestFile,
};
