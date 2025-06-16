import { extractModuleSizesTree } from "./stats.js";
import fs from 'fs';

export function getConfig() {
  try{
    const meteorAppDir = process.cwd();
    const packageJson = fs.readFileSync(`${meteorAppDir}/package.json`, 'utf8');
    const meteorConfig = JSON.parse(packageJson).meteor;
    return meteorConfig;
  } catch (error) {
    console.log(error);
    return {};
  }
};

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
if (typeof global.Profile !== 'undefined') {
  Profile = global.Profile;
} else if (typeof Plugin !== 'undefined' && Plugin.Profile) {
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

  constructor() {
    this.config = getConfig();
  }

  _minifyWithSWC(file) {
    return Profile('_minifyWithSWC', () => {
      swc = swc || require('@meteorjs/swc-core'); 
      const NODE_ENV = process.env.NODE_ENV || 'development';
      
      let content = file.getContentsAsString();

      return swc.minifySync(
        content,
        {
          ecma: 5,
          compress: {
            drop_debugger: false,

            unused: true,
            dead_code: true,
            typeofs: false,

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
      const modern = this.config && (this.config.modern === true || (this.config.modern && this.config.modern.minifier === true));
      // check if config is an empty object
      if(this.config && Object.keys(this.config).length === 0 || !modern) {
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

  // don't minify anything for development
  if (mode === 'development') {
    files.forEach(function (file) {
      file.addJavaScript({
        data: file.getContentsAsBuffer(),
        sourceMap: file.getSourceMap(),
        path: file.getPathInBundle(),
      });
    });
    return;
  }

  // this function tries its best to locate the original source file
  // that the error being reported was located inside of
  function maybeThrowMinifyErrorBySourceFile(error, file) {
    const lines = file.getContentsAsString().split(/\n/);
    const lineContent = lines[error.line - 1];

    let originalSourceFileLineNumber = 0;

    // Count backward from the failed line to find the oringal filename
    for (let i = (error.line - 1); i >= 0; i--) {
        let currentLine = lines[i];

        // If the line is a boatload of slashes (8 or more), we're in the right place.
        if (/^\/\/\/{6,}$/.test(currentLine)) {

            // If 4 lines back is the same exact line, we've found the framing.
            if (lines[i - 4] === currentLine) {

                // So in that case, 2 lines back is the file path.
                let originalFilePath = lines[i - 2].substring(3).replace(/\s+\/\//, "");

                throw new Error(
                    `terser minification error (${error.name}:${error.message})\n` +
                    `Source file: ${originalFilePath}  (${originalSourceFileLineNumber}:${error.col})\n` +
                    `Line content: ${lineContent}\n`);
            }
        }
        originalSourceFileLineNumber++;
    }
  }
    
  // this object will collect all the minified code in the
  // data field and post-minfiication file sizes in the stats field
  const toBeAdded = {
    data: "",
    stats: Object.create(null)
  };

  for (let file of files) {
    // Don't reminify *.min.js.
    if (/\.min\.js$/.test(file.getPathInBundle())) {
      toBeAdded.data += file.getContentsAsString();
      Plugin.nudge();
      continue;
    }
 
    let minified;
    let label = 'minify file'
    if (file.getPathInBundle() === 'app/app.js') {
      label = 'minify app/app.js'
    }
    if (file.getPathInBundle() === 'packages/modules.js') {
      label = 'minify packages/modules.js'
    }

    try {
      // Need to update this approach for async/await
      let minifyPromise;
      Profile.time(label, () => {
        minifyPromise = this.minifyOneFile(file);
      });
      minified = await minifyPromise;
      
      if (!(minified && typeof minified.code === "string")) {
        throw new Error(`Invalid minification result for ${file.getPathInBundle()}`);
      }
    }
    catch (err) {
      maybeThrowMinifyErrorBySourceFile(err, file);
      var filePath = file.getPathInBundle();
      err.message += " while minifying " + filePath;
      throw err;
    }

    if (statsEnabled) {
      let tree;
      Profile.time('extractModuleSizesTree', () => {
        tree = extractModuleSizesTree(minified.code);
        if (tree) {
          toBeAdded.stats[file.getPathInBundle()] = [Buffer.byteLength(minified.code), tree];
        } else {
          toBeAdded.stats[file.getPathInBundle()] = Buffer.byteLength(minified.code);
        }
        // append the minified code to the "running sum"
        // of code being minified
      });
      // Add the minified code outside of the Profile.time
      toBeAdded.data += minified.code;
    } else {
      // If stats are disabled, still need to add the minified code
      toBeAdded.data += minified.code;
    }

    toBeAdded.data += '\n\n';
    
    Plugin.nudge();
  }

  // this is where the minified code gets added to one
  // JS file that is delivered to the client
  if (files.length) {
    files[0].addJavaScript(toBeAdded);
  }
});
