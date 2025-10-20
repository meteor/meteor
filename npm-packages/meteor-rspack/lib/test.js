const fs = require('fs');
const path = require('path');
const { createIgnoreRegex, createIgnoreGlobConfig } = require("./ignore.js");

/**
 * Generates eager test files dynamically
 * @param {Object} options - Options for generating the test file
 * @param {boolean} options.isAppTest - Whether this is an app test
 * @param {string} options.projectDir - The project directory
 * @param {string} options.buildContext - The build context
 * @param {string[]} options.entries - Array of ignore patterns
 * @returns {string} The path to the generated file
 */
const generateEagerTestFile = ({
  isAppTest,
  projectDir,
  buildContext,
  entries = [],
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
    ...entries,
  ];

  // Create regex from ignore entries
  const excludeFoldersRegex = createIgnoreRegex(
    createIgnoreGlobConfig(ignoreEntries)
  );

  const filename = isAppTest ? "eager-app-tests.mjs" : "eager-tests.mjs";
  const filePath = path.resolve(distDir, filename);
  const regExp = isAppTest
    ? "/\\.app-(?:test|spec)s?\\.[^.]+$/"
    : "/\\.(?:test|spec)s?\\.[^.]+$/";

  const content = `{
  const ctx = import.meta.webpackContext('/', {
    recursive: true,
    regExp: ${regExp},
    exclude: ${excludeFoldersRegex.toString()},
    mode: 'eager',
  });
  ctx.keys().forEach(ctx);
}`;

  fs.writeFileSync(filePath, content);
  return filePath;
};

module.exports = {
  generateEagerTestFile,
};
