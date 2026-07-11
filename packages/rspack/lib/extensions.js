/**
 * @module extensions
 * @description Static knowledge about which file extensions the rspack
 * bundler owns, used to build METEOR_IGNORE patterns.
 *
 * This module is intentionally pure (no filesystem access, no tools-core
 * imports) so the ignore-list computation stays O(1) regardless of project
 * size and can be unit tested in isolation.
 */

/**
 * File extensions that rspack bundles and Meteor must therefore ignore
 * inside application source directories.
 *
 * This is a fixed list rather than an enumeration of every extension found
 * in the project tree. Scanning the tree is unnecessary: Meteor's app
 * bundler only ever collects files whose extension matches a registered
 * source processor (see tools/isobuild/compiler.js — "random files outside
 * of private/public never end up in the source list anyway"), so ignore
 * patterns for extensions Meteor has no handler for are dead weight. A scan
 * also costs an O(files) glob on every config build and, multiplied by every
 * top-level directory, can inflate METEOR_IGNORE past tens of kilobytes on
 * large projects — enough to matter for execve's combined arg+env limit
 * when that environment is forwarded to child processes.
 *
 * The list therefore covers only extensions Meteor commonly has source
 * processors for in modern apps, which rspack now owns:
 * - JS/TS modules and JSON, bundled by rspack.
 * - Stylesheets and markup, bundled by rspack unless a Meteor compiler
 *   package owns them for this project (see getCodeExtensionsToIgnore).
 * - Compile-to-JS and single-file-component sources handled by rspack
 *   loaders when configured.
 *
 * @constant {string[]}
 */
export const CODE_EXTENSIONS_TO_IGNORE = [
  // JavaScript/TypeScript modules and JSON — bundled by rspack.
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  // Stylesheets — bundled by rspack unless a Meteor compiler owns them.
  '.css',
  '.less',
  '.scss',
  '.sass',
  '.styl',
  // Markup — bundled by rspack unless Blaze owns it.
  '.html',
  // Compile-to-JS and single-file-component sources handled by rspack
  // loaders when configured.
  '.coffee',
  '.vue',
  '.svelte',
];

/**
 * Returns the file extensions Meteor should ignore in application source
 * directories, minus the extensions owned by an active Meteor compiler:
 * - Blaze projects keep .html visible so blaze-html-templates can compile
 *   templates.
 * - Less projects keep .less visible for the less compiler.
 * - SCSS projects keep .scss and .sass visible for the scss compiler
 *   (fourseven:scss handles both syntaxes).
 *
 * Pure function of its flags — never touches the filesystem, so the result
 * is identical no matter how many files (or how exotic their extensions)
 * the project contains.
 *
 * @param {Object} project - Which Meteor compilers are active
 * @param {boolean} [project.isBlazeProject] - Blaze templating is in use
 * @param {boolean} [project.isLessProject] - The less compiler is in use
 * @param {boolean} [project.isScssProject] - The scss compiler is in use
 * @returns {string[]} A fresh array of extensions to ignore
 */
export function getCodeExtensionsToIgnore({
  isBlazeProject,
  isLessProject,
  isScssProject,
} = {}) {
  const compilerOwnedExtensions = [
    ...((isBlazeProject && ['.html']) || []),
    ...((isLessProject && ['.less']) || []),
    ...((isScssProject && ['.scss', '.sass']) || []),
  ];

  return CODE_EXTENSIONS_TO_IGNORE.filter(
    ext => !compilerOwnedExtensions.includes(ext),
  );
}
