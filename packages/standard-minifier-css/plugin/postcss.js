import { createHash } from "crypto";
import micromatch from 'micromatch';
import { performance } from 'perf_hooks';

var fs = Plugin.fs;
var path = Plugin.path;

const DEBUG_CACHE = process.env.DEBUG_METEOR_POSTCSS_DEP_CACHE === 'true';

let postcssConfig;
let loaded = false;

const missingPostCssError = new Error([
    '',
    `The postcss npm package could not be found in your node_modules`,
    'directory. Please run the following command to install it:',
    '    meteor npm install postcss@8',
    'or disable postcss by removing the postcss config.',
    '',
  ].join('\n'));

  export async function loadPostCss() {
    if (loaded) {
      return { postcssConfig };
    }
  
    const plugins = [];
    let postcss;
    
    // Try to load postcss first
    try {
      postcss = require('postcss');
    } catch (e) {
      return { error: missingPostCssError };
    }
    
    // Try to load tailwindcss if it exists
    try {
      const tailwind = require('tailwindcss');
      plugins.push(tailwind());
    } catch (e) {
      // Tailwind not found, continue without it
    }
  
    // Try loading from postcss-load-config as fallback
    try {
      const loadConfig = require('postcss-load-config');
      const config = await loadConfig({ meteor: true });
      plugins.push(...config.plugins);
    } catch (e) {
      // If no config found, that's fine - we might have Tailwind
      if (!plugins.length && !e.message.includes('No PostCSS Config found in')) {
        if (e.message.includes('Cannot find module \'postcss\'')) {
          return { error: missingPostCssError };
        }
        return { error: e };
      }
    }
  
    if (plugins.length > 0) {
      postcssConfig = {
        postcss,
        plugins,
        options: {
          parser: null
        },
        excludedMeteorPackages: []
      };
    }
  
    loaded = true;
    return { postcssConfig };
  }
  
  export function usePostCss(file, postcssConfig) {
    if (!postcssConfig || !postcssConfig.plugins || !postcssConfig.plugins.length) {
      return false;
    }
  
    // Skip excluded Meteor packages only if the file is from a package
    if (postcssConfig.excludedMeteorPackages && 
        file.getArch().startsWith('web.browser')) {
      const path = file.getPathInBundle();
      // Check if the file is from a package (packages are in the format packages/package-name/...)
      if (path.startsWith('packages/')) {
        const packagePath = path.split('/')[1]; // Get the package name from the path
        if (postcssConfig.excludedMeteorPackages.includes(packagePath.replace('_', ':'))) {
          return false;
        }
      }
    }
  
    return true;
  }

export const watchAndHashDeps = Profile(
  'watchAndHashDeps',
  function (deps, hashAndWatchFile) {
    const hash = createHash('sha1');
    const globsByDir = Object.create(null);
    let fileCount = 0;
    let folderCount = 0;
    let start = performance.now();

    deps.forEach(dep => {
      if (dep.type === 'dependency') {
        fileCount += 1;
        const fileHash = hashAndWatchFile(dep.file);
        hash.update(fileHash).update('\0');
      } else if (dep.type === 'dir-dependency') {
        if (dep.dir in globsByDir) {
          globsByDir[dep.dir].push(dep.glob || '**');
        } else {
          globsByDir[dep.dir] = [dep.glob || '**'];
        }
      }
    });


    Object.entries(globsByDir).forEach(([parentDir, globs]) => {
      const matchers = globs.map(glob => micromatch.matcher(glob));

      function walk(relDir) {
        const absDir = path.join(parentDir, relDir);
        hash.update(absDir).update('\0');
        folderCount += 1;

        const entries = fs.readdirWithTypesSync(absDir);
        for (const entry of entries) {
          const relPath = path.join(relDir, entry.name);

          if (entry.isFile() && matchers.some(isMatch => isMatch(relPath))) {
            const absPath = path.join(absDir, entry.name);
            fileCount += 1;
            hash.update(hashAndWatchFile(absPath)).update('\0');
          } else if (
            entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.meteor'
          ) {
            walk(relPath);
          }
        }
      }

      walk('./');
    });

    let digest = hash.digest('hex');

    if (DEBUG_CACHE) {
      console.log('--- PostCSS Cache Info ---');
      console.log('Glob deps', JSON.stringify(globsByDir, null, 2));
      console.log('File dep count', fileCount);
      console.log('Walked folders', folderCount);
      console.log('Created dep cache key in', performance.now() - start, 'ms');
      console.log('--------------------------');
    }

    return digest;
});
