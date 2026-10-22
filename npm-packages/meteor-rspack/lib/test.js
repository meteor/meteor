const fs = require('fs');
const path = require('path');
const {
  createIgnoreGlobConfig,
  createIgnoreMatcherSource,
  createIgnoreRegex,
} = require("./ignore.js");

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
    createIgnoreGlobConfig(ignoreEntries),
    projectDir,
  );
  // Build the .meteorignore filter. It is `ignore`-backed rather than a regex
  // because gitignore's last-match-wins rule cannot be expressed as one, and
  // collapsing it into one used to drop every `!` pattern — silently loading
  // zero test files for a sharded run.
  const meteorIgnoreMatcher = createIgnoreMatcherSource(inMeteorIgnoreEntries);

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
    meteorIgnoreMatcher
      ? `import MeteorIgnore from '${toPosix(meteorIgnoreMatcher.modulePath)}';\n\n` +
        `const MeteorIgnoreMatcher = ${meteorIgnoreMatcher.source}(MeteorIgnore);`
      : ""
  }
{
  const ctx = import.meta.webpackContext('${toPosix(projectDir)}', {
    recursive: true,
    regExp: ${regExp},
    exclude: ${excludeFoldersRegex.toString()},
    mode: 'eager',
  });
  await Promise.all(ctx.keys().filter((k) => {
    ${
      meteorIgnoreMatcher
        ? `// Only exclude based on *relative* path segments.
    return !MeteorIgnoreMatcher(k);`
        : "return true;"
    }
  }).map(ctx));
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
