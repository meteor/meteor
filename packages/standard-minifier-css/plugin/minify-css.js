import sourcemap from "source-map";
import { createHash } from "crypto";
import LRU from "lru-cache";
import { loadPostCss, watchAndHashDeps, usePostCss } from './postcss.js';
import { Log } from 'meteor/logging';

const { argv, env:{ DEBUG_CSS } } = process;
const verbose = (DEBUG_CSS!=="false" && DEBUG_CSS!=="0" && (
  DEBUG_CSS || argv.indexOf('--verbose') > -1 || argv.indexOf('--debug') > -1
));

Plugin.registerMinifier({
  extensions: ["css"],
  archMatching: "web",
}, function () {
  const minifier = new CssToolsMinifier();
  return minifier;
});

class CssToolsMinifier {
  constructor() {
    this.cache = new LRU({
      max: 100,
    });

    this.depsHashCache = Object.create(null);
    this.totalSize = 0;
    this.totalMinifiedSize = 0;
    this.haveHitAnyCache = false; // once we hit the cache, there's no point in showing 'Adding CSS', we know it will be fine and floods the terminal needlessly.
  }

  beforeMinify() {
    this.depsHashCache = Object.create(null);
  }

  formatSize(bytes) {
    return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes/1024)}k`;
  }

  watchAndHashDeps(deps, file) {
    const cacheKey = JSON.stringify(deps);

    if (cacheKey in this.depsHashCache) {
      return this.depsHashCache[cacheKey];
    }

    let hash = watchAndHashDeps(deps, (filePath) => {
      return file.readAndWatchFileWithHash(filePath).hash;
    });
    this.depsHashCache[cacheKey] = hash;

    return hash;
  }

  async minifyFiles (files, mode, postcssConfig) {
    const cacheKey = createCacheKey(files, mode);
    const cachedResult = this.cache.get(cacheKey);

    if (
      cachedResult &&
      cachedResult.depsCacheKey === this.watchAndHashDeps(cachedResult.deps, files[0])
    ) {
      if (verbose && !this.haveHitAnyCache) {
        this.haveHitAnyCache = true;
        setTimeout( () => { // we use a timeout to give all files a chance to finish being minified
          const stats = [`minifyStdCSS: Total CSS ${this.formatSize(this.totalSize)}`];
          if (this.totalMinifiedSize!==0) {
            stats.push(`minified ${this.formatSize(this.totalMinifiedSize)}`);
            stats.push(`reduction ${Math.round(100-this.totalMinifiedSize*100/this.totalSize)}%`);
          }
          console.log(stats.join(", "));
        }, 500);
      }
      return cachedResult.stylesheets;
    }

    let result = [];
    if (verbose) process.stdout.write(` > Merging [ ${files.map( ({ _source:{ targetPath } }) => targetPath ).join(' ')} ]`);
    const merged = await mergeCss(files, postcssConfig);
    if (verbose) {
      process.stdout.write(` > ${this.formatSize(merged.code.length)}`);
      this.totalSize += merged.code.length;
    }

    if (mode === 'development') {
      result = [{
        data: merged.code,
        sourceMap: merged.sourceMap,
        path: 'merged-stylesheets.css',
      }];
    } else {
      if (verbose) process.stdout.write(` > minifying`);

      const minifiedFiles = await CssTools.minifyCssAsync(merged.code);
      result = minifiedFiles.map( minified => ({ data:minified }) );

      if (verbose) {
        const minifiedSize = minifiedFiles.reduce( (sum, minifiedFile) => sum + minifiedFile.length, 0);
        process.stdout.write(` > ${this.formatSize(minifiedSize)}`);
        this.totalMinifiedSize += minifiedSize;
      }
    }

    if (verbose) process.stdout.write('\n');

    this.cache.set(cacheKey, {
      stylesheets: result,
      deps: merged.deps,
      depsCacheKey: this.watchAndHashDeps(merged.deps, files[0]),
    });
    return result;
  }

  async processFilesForBundle(files, { minifyMode }) {
    if (! files.length) return;

    const { error, postcssConfig } = await loadPostCss();

    if (error) {
      if (verbose) Log.error('processFilesForBundle loadPostCss error', error);
      files[0].error(error);
      return;
    }

    const stylesheets = await this.minifyFiles(files, minifyMode, postcssConfig);

    stylesheets.forEach( (stylesheet,i) => {
      if (verbose && !this.haveHitAnyCache) process.stdout.write(`Adding CSS${i===0?'':' '+i+1}`);
      files[0].addStylesheet(stylesheet);
    });
  }
}

const createCacheKey = Profile("createCacheKey", function (files, minifyMode) {
  const hash = createHash("sha1");
  hash.update(minifyMode).update("\0");
  files.forEach(f => {
    hash.update(f.getSourceHash()).update("\0");
  });
  return hash.digest("hex");
});

function disableSourceMappingURLs(css) {
  return css.replace(/# sourceMappingURL=/g,
                     "# sourceMappingURL_DISABLED=");
}

// Lints CSS files and merges them into one file, fixing up source maps and
// pulling any @import directives up to the top since the CSS spec does not
// allow them to appear in the middle of a file.
const mergeCss = Profile("mergeCss", async function (css, postcssConfig) {
  // Filenames passed to AST manipulator mapped to their original files
  const originals = {};
  const deps = [];

  const astPromises = css.map(async function (file) {
    const filename = file.getPathInBundle();
    originals[filename] = file;

    let ast;
    try {
      let content = disableSourceMappingURLs(file.getContentsAsString());

      if (usePostCss(file, postcssConfig)) {
        const result = await postcssConfig.postcss(
          postcssConfig.plugins
        ).process(content, {
          from: Plugin.convertToOSPath(file.getSourcePath()),
          parser: postcssConfig.options.parser,
        });

        result.warnings().forEach(warning => {
          warnCb(filename, warning.toString());
        });
        result.messages.forEach(message => {
          if (['dependency', 'dir-dependency'].includes(message.type)) {
            deps.push(message);
          }
        });
        content = result.css;
      }

      const parseOptions = { source: filename, position: true };
      ast = CssTools.parseCss(content, parseOptions);
      ast.filename = filename;
    } catch (e) {
      if (e.reason) {
        file.error({
          message: e.reason,
          line: e.line,
          column: e.column,
        });
      } else {
        // Just in case it's not the normal error the library makes.
        file.error({message: e.stack});
      }

      return { type: "stylesheet", stylesheet: { rules: [] }, filename };
    }

    return ast;
  });

  const cssAsts = await Promise.all(astPromises);

  const mergedCssAst = CssTools.mergeCssAsts(cssAsts, warnCb);

  // Overwrite the CSS files list with the new concatenated file
  const stringifiedCss = CssTools.stringifyCss(mergedCssAst, {
    sourcemap: true,
    // don't try to read the referenced sourcemaps from the input
    inputSourcemaps: false,
  });

  if (! stringifiedCss.code) {
    return { code: '', deps };
  }

  // Add the contents of the input files to the source map of the new file
  stringifiedCss.map.sourcesContent =
    stringifiedCss.map.sources.map(function (filename) {
      const file = originals[filename] || null;
      return file && file.getContentsAsString();
    });

  // Compose the concatenated file's source map with source maps from the
  // previous build step if necessary.
  const newMap = await Profile.time("composing source maps", async function () {
    const newMap = new sourcemap.SourceMapGenerator();
    const concatConsumer = await new sourcemap.SourceMapConsumer(stringifiedCss.map);
    // Create a dictionary of source map consumers for fast access
    const consumers = Object.create(null);

    await Promise.all(Object.entries(originals).map(async ([name, file]) => {
      const sourceMap = file.getSourceMap();

      if (sourceMap) {
        try {
          consumers[name] = await new sourcemap.SourceMapConsumer(sourceMap);
        } catch (err) {
          // If we can't apply the source map, silently drop it.
          //
          // XXX This is here because there are some less files that
          // produce source maps that throw when consumed. We should
          // figure out exactly why and fix it, but this will do for now.
        }
      }
    }));

    // Maps each original source file name to the SourceMapConsumer that
    // can provide its content.
    const sourceToConsumerMap = Object.create(null);

    // Find mappings from the concatenated file back to the original files
    concatConsumer.eachMapping((mapping) => {
      let { source } = mapping;
      const consumer = consumers[source];

      let original = {
        line: mapping.originalLine,
        column: mapping.originalColumn,
      };

      // If there is a source map for the original file, e.g., if it has been
      // compiled from Less to CSS, find the source location in the original's
      // original file. Otherwise, use the mapping of the concatenated file's
      // source map.
      if (consumer) {
        const newOriginal = consumer.originalPositionFor(original);

        // Finding the original position should always be possible (otherwise,
        // one of the source maps would have incorrect mappings). However, in
        // case there is something wrong, use the intermediate mapping.
        if (newOriginal.source !== null) {
          original = newOriginal;
          source = original.source;

          if (source) {
            // Since the new consumer provided a different
            // original.source, we should ask it for the original source
            // content instead of asking the concatConsumer.
            sourceToConsumerMap[source] = consumer;
          }
        }
      }

      if (source && ! sourceToConsumerMap[source]) {
        // If we didn't set sourceToConsumerMap[source] = consumer above,
        // use the concatConsumer to determine the original content.
        sourceToConsumerMap[source] = concatConsumer;
      }

      // Add a new mapping to the final source map
      newMap.addMapping({
        generated: {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        },
        original,
        source,
      });
    });

    // The consumer.sourceContentFor and newMap.setSourceContent methods
    // are relatively fast, but not entirely trivial, so it's better to
    // call them only once per source, rather than calling them every time
    // we call newMap.addMapping in the loop above.
    Object.entries(sourceToConsumerMap).forEach(([source, consumer]) => {
      const content = consumer.sourceContentFor(source);
      newMap.setSourceContent(source, content);
    });

    concatConsumer.destroy();
    Object.values(consumers).forEach(consumer => consumer.destroy());

    return newMap;
  });

  return {
    code: stringifiedCss.code,
    sourceMap: newMap.toString(),
    deps,
  };
});

function warnCb (filename, msg) {
  // XXX make this a buildmessage.warning call rather than a random log.
  //     this API would be like buildmessage.error, but wouldn't cause
  //     the build to fail.
  Log.warn(`${filename}: warn: ${msg}`);
};
