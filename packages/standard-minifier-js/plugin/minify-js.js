import { extractModuleSizesTree } from "./stats.js";

const statsEnabled = process.env.DISABLE_CLIENT_STATS !== 'true'


const Meteor = typeof global.Meteor !== 'undefined' ? global.Meteor : {
  _debug: function(...args) {
    if (typeof console !== 'undefined' && typeof console.log !== 'undefined' && process.env.NODE_INSPECTOR_IPC) {
      console.log('[DEBUG]', ...args);
    }
  }
};

// Profile for test and production environments
let Profile;
if (typeof Plugin !== 'undefined' && Plugin.Profile) {
  Profile = Plugin.Profile;
} else {
  Profile = function (label, func) {
    return function () {
      return func.apply(this, arguments);
    }
  }
  Profile.time = function (label, func) {
    func();
  }
}

function getMeteorConfig() {
  return Plugin?.getMeteorConfig() || {};
}

let swc;

// Register the minifier only when Plugin is available (not in tests)
if (typeof Plugin !== 'undefined') {
  Plugin.registerMinifier({
      extensions: ['js'],
      archMatching: 'web',
    },
    () => new MeteorMinifier()
  );
}

export class MeteorMinifier {
  _minifyWithSWC(file) {
    return Profile('_minifyWithSWC', () => {
      swc = swc || require('@meteorjs/swc-core'); 
      const NODE_ENV = process.env.NODE_ENV || 'development';
      
      let content = file.getContentsAsString();
      const isLegacyWebArch = file?._arch === 'web.browser.legacy';

      return swc.minifySync(
        content,
        {
          ecma: 5,
          compress: {
            drop_debugger: false,

            unused: true,
            dead_code: true,
            typeofs: false,
            ...(isLegacyWebArch && { defaults: false }),

            global_defs: {
              'process.env.NODE_ENV': NODE_ENV,
            },
          },
          safari10: true,
          inlineSourcesContent: true
        }
      );
    })();
  }

  _minifyWithTerser(file) {
    return Profile('_minifyWithTerser', async () => {
      let terser = require('terser');
      const NODE_ENV = process.env.NODE_ENV || 'development';
      const content = file.getContentsAsString();
      
      return terser.minify(content, {
        compress: {
          drop_debugger: false,
          unused: false,
          dead_code: true,
          global_defs: {
            "process.env.NODE_ENV": NODE_ENV
          }
        },
        // Fix issue meteor/meteor#9866, as explained in this comment:
        // https://github.com/mishoo/UglifyJS2/issues/1753#issuecomment-324814782
        // And fix terser issue #117: https://github.com/terser-js/terser/issues/117
        safari10: true
      }).then(result => {
        if (!result) {
          throw new Error(`Terser produced empty result for ${file.getPathInBundle()}`);
        }
        return result;
      }).catch(error => {
        throw error;
      });
    })();
  }

  minifyOneFile(file) {
    return Profile('minifyOneFile', () => {
      const meteorConfig = getMeteorConfig();
      const modern =
        meteorConfig &&
        (meteorConfig?.modern === true ||
          (meteorConfig?.modern &&
            meteorConfig?.modern?.minifier === true));
      // check if config is an empty object
      if(meteorConfig && Object.keys(meteorConfig).length === 0 || !modern) {
        Meteor._debug(`Minifying using Terser  | file: ${file.getPathInBundle()}`);
        return this._minifyWithTerser(file);
      }

      try {
        Meteor._debug(`Minifying using SWC  | file: ${file.getPathInBundle()}`);
        return this._minifyWithSWC(file);
      } catch (swcError) {
        Meteor._debug(`SWC failed  | file: ${file.getPathInBundle()}`);
        return this._minifyWithTerser(file);
      }
    })();
  }
}

MeteorMinifier.prototype.processFilesForBundle = Profile('processFilesForBundle', async function (files, options) {
  const mode = options.minifyMode;

  if (mode === 'development') {
    files.forEach((file) => {
      file.addJavaScript({
        data: file.getContentsAsBuffer(),
        sourceMap: file.getSourceMap(),
        path: file.getPathInBundle(),
      });
    });
    return;
  }

  function maybeThrowMinifyErrorBySourceFile(error, file) {
    const lines = file.getContentsAsString().split(/\n/);
    const lineContent = lines[error.line - 1];
    let originalSourceFileLineNumber = 0;

    for (let i = (error.line - 1); i >= 0; i--) {
      const currentLine = lines[i];
      if (/^\/\/\/{6,}$/.test(currentLine)) {
        if (lines[i - 4] === currentLine) {
          const originalFilePath = lines[i - 2].substring(3).replace(/\s+\/\//, "");
          throw new Error(
            `terser minification error (${error.name}:${error.message})\n` +
            `Source file: ${originalFilePath}  (${originalSourceFileLineNumber}:${error.col})\n` +
            `Line content: ${lineContent}\n`);
        }
      }
      originalSourceFileLineNumber++;
    }
  }

  const toBeAdded = {
    data: "",
    stats: Object.create(null),
  };

  // Separate pre-minified files from those needing minification.
  const filesToMinify = [];
  for (const file of files) {
    if (/\.min\.js$/.test(file.getPathInBundle())) {
      toBeAdded.data += file.getContentsAsString();
      Plugin.nudge();
    } else {
      filesToMinify.push(file);
    }
  }

  for (const file of filesToMinify) {
    let minified;
    try {
      let minifyPromise;
      Profile.time('minify file', () => {
        minifyPromise = this.minifyOneFile(file);
      });
      minified = await minifyPromise;

      if (!(minified && typeof minified.code === "string")) {
        throw new Error(`Invalid minification result for ${file.getPathInBundle()}`);
      }
    } catch (err) {
      maybeThrowMinifyErrorBySourceFile(err, file);
      err.message += " while minifying " + file.getPathInBundle();
      throw err;
    }

    if (statsEnabled) {
      const tree = extractModuleSizesTree(minified.code);
      if (tree) {
        toBeAdded.stats[file.getPathInBundle()] = [Buffer.byteLength(minified.code), tree];
      } else {
        toBeAdded.stats[file.getPathInBundle()] = Buffer.byteLength(minified.code);
      }
    }
    toBeAdded.data += minified.code;
    toBeAdded.data += '\n\n';
    Plugin.nudge();
  }

  if (files.length) {
    files[0].addJavaScript(toBeAdded);
  }
});
