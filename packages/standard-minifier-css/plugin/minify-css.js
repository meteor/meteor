import sourcemap from "source-map";
import { createHash } from "crypto";
import LRU from "lru-cache";

Plugin.registerMinifier({
  extensions: ["css"],
  archMatching: "web"
}, function () {
  const minifier = new CssToolsMinifier();
  return minifier;
});

class CssToolsMinifier {

  async processFilesForBundle (files, options) {
    const mode = options.minifyMode;
  
    if (! files.length) return;
  
    const merged = await mergeCss(files);

    if (mode === 'development') {
      files[0].addStylesheet({
    	data: merged.code,
      	sourceMap: merged.sourceMap,
      	path: 'merged-stylesheets.css'
      });
      return;
    }
  
    const minifiedFiles = CssTools.minifyCss(merged.code);
  
    if (files.length) {
      minifiedFiles.forEach(function (minified) {
        files[0].addStylesheet({
          data: minified
        });
      });
    }
  }

}


const mergeCache = new LRU({
  max: 100
});

const hashFiles = Profile("hashFiles", function (files) {
  const hash = createHash("sha1");
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
const mergeCss = Profile("mergeCss", async function (css) {
  const hashOfFiles = hashFiles(css);
  let merged = mergeCache.get(hashOfFiles);
  if (merged) {
    return merged;
  }

  // Filenames passed to AST manipulator mapped to their original files
  const originals = {};

  const cssAsts = css.map(function (file) {
    const filename = file.getPathInBundle();
    originals[filename] = file;
    let ast;
    try {
      const parseOptions = { source: filename, position: true };
      const css = disableSourceMappingURLs(file.getContentsAsString());
      ast = CssTools.parseCss(css, parseOptions);
      ast.filename = filename;
    } catch (e) {
      if (e.reason) {
        file.error({
          message: e.reason,
          line: e.line,
          column: e.column
        });
      } else {
        // Just in case it's not the normal error the library makes.
        file.error({message: e.message});
      }

      return { type: "stylesheet", stylesheet: { rules: [] }, filename };
    }

    return ast;
  });

  const warnCb = (filename, msg) => {
    // XXX make this a buildmessage.warning call rather than a random log.
    //     this API would be like buildmessage.error, but wouldn't cause
    //     the build to fail.
    console.log(`${filename}: warn: ${msg}`);
  };

  const mergedCssAst = CssTools.mergeCssAsts(cssAsts, warnCb);

  // Overwrite the CSS files list with the new concatenated file
  const stringifiedCss = CssTools.stringifyCss(mergedCssAst, {
    sourcemap: true,
    // don't try to read the referenced sourcemaps from the input
    inputSourcemaps: false
  });

  if (! stringifiedCss.code) {
    mergeCache.set(hashOfFiles, merged = { code: '' });
    return merged;
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
        column: mapping.originalColumn
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
          column: mapping.generatedColumn
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

  mergeCache.set(hashOfFiles, merged = {
    code: stringifiedCss.code,
    sourceMap: newMap.toString()
  });

  return merged;
});
