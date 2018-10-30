import path from 'path';
import url from 'url';
import Future from 'fibers/future';
import postcss from 'postcss';
import cssnano from 'cssnano';

const CssTools = {
  /**
   * Parse the incoming CSS string; return a CSS AST.
   *
   * @param {string} cssText The CSS string to be parsed.
   * @param {Object} options Options to pass to the PostCSS parser.
   * @return {postcss#Root} PostCSS Root AST.
   */
  parseCss(cssText, options = {}) {
    // This function previously used the `css-parse` npm package, which
    // set the name of the css file being pased using  { source: 'filename' }.
    // If included, we'll convert this to the `postcss` equivalent, to maintain
    // backwards compatibility.
    if (options.source) {
      options.from = options.source;
      delete options.source;
    }
    return postcss().process(cssText, options).root;
  },

  /**
   * Using the incoming CSS AST, create and return a new object with the
   * generated CSS string, and optional sourcemap details.
   *
   * @param {postcss#Root} cssAst PostCSS Root AST.
   * @param {Object} options Options to pass to the PostCSS parser.
   * @return {Object} Format: { code: 'css string', map: 'sourcemap deatils' }.
   */
  stringifyCss(cssAst, options = {}) {
    // This function previously used the `css-stringify` npm package, which
    // controlled sourcemap generation by passing in { sourcemap: true }.
    // If included, we'll convert this to the `postcss` equivalent, to maintain
    // backwards compatibility.
    if (options.sourcemap) {
      options.map = {
        inline: false,
        annotation: false,
        sourcesContent: false,
      };
      delete options.sourcemap;
    }

    const f = new Future;
    postcss().process(cssAst, options).then(result => {
      f.return(result);
    }).catch(error => {
      f.throw(error);
    });
    transformResult = f.wait();
    return {
      code: transformResult.css,
      map: transformResult.map ? transformResult.map.toJSON() : null,
    };
  },

  /**
   * Minify the passed in CSS string.
   *
   * @param {string} cssText CSS string to minify.
   * @return {String[]} Array containing the minified CSS.
   */
  minifyCss(cssText) {
    const f = new Future;
    postcss([ cssnano({ safe: true }) ]).process(cssText).then(result => {
      f.return(result.css);
    }).catch(error => {
      f.throw(error);
    });
    const minifiedCss = f.wait();

    // Since this function has always returned an array, we'll wrap the
    // minified css string in an array before returning, even though we're
    // only ever returning one minified css string in that array (maintaining
    // backwards compatibility).
    return [minifiedCss];
  },

  /**
   * Merge multiple CSS AST's into one.
   *
   * @param {postcss#Root[]} cssAsts Array of PostCSS Root objects.
   * @callback warnCb Callback used to handle warning messages.
   * @return {postcss#Root} PostCSS Root object.
   */
  mergeCssAsts(cssAsts, warnCb) {
    const rulesPredicate = (rules, exclude = false) => {
      if (! Array.isArray(rules)) {
        rules = [rules];
      }
      return node =>
        exclude ? !rules.includes(node.name) : rules.includes(node.name);
    };

    // Simple concatenation of CSS files would break @import rules
    // located in the beginning of a file. Before concatenation, pull
    // @import rules to the beginning of a new syntax tree so they always
    // precede other rules.
    const newAst = postcss.root();

    cssAsts.forEach((ast) => {
      if (ast.nodes) {
        // Pick only the imports from the beginning of file ignoring @charset
        // rules as every file is assumed to be in UTF-8.
        const charsetRules = ast.nodes.filter(rulesPredicate('charset'));

        if (charsetRules.some((rule) => {
          // According to MDN, only 'UTF-8' and "UTF-8" are the correct
          // encoding directives representing UTF-8.
          return ! /^(['"])UTF-8\1$/.test(rule.params);
        })) {
          warnCb(
            ast.filename,
            '@charset rules in this file will be ignored as UTF-8 is the ' +
            'only encoding supported'
          );
        }

        ast.nodes = ast.nodes.filter(rulesPredicate('charset', true));
        let importCount = 0;
        for (let i = 0; i < ast.nodes.length; i++) {
          if (! rulesPredicate(['import', 'comment'])(ast.nodes[i])) {
            importCount = i;
            break;
          }
        }

        CssTools.rewriteCssUrls(ast);

        const imports = ast.nodes.splice(0, importCount);
        newAst.nodes.push(...imports);

        // If there are imports left in the middle of a file, warn users as it
        // might be a potential bug (imports are only valid at the beginning of
        // a file).
        if (ast.nodes.some(rulesPredicate('import'))) {
          warnCb(
            ast.filename,
            'There are some @import rules those are not taking effect as ' +
            'they are required to be in the beginning of the file.'
          );
        }
      }
    });

    // Now we can put the rest of CSS rules into new AST.
    cssAsts.forEach((ast) => {
      if (ast.nodes) {
        newAst.nodes.push(...ast.nodes);
      }
    });

    return newAst;
  },

  /**
   * We are looking for all relative urls defined with the `url()` functional
   * notation and rewriting them to the equivalent absolute url using the
   * `source` path provided by postcss. For performance reasons this function
   * acts by side effect by modifying the given AST without doing a deep copy.
   *
   * @param {postcss#Root} ast PostCSS Root object.
   * @return Modifies the ast param in place.
   */
  rewriteCssUrls(ast) {
    const mergedCssPath = '/';
    rewriteRules(ast.nodes, mergedCssPath);
  }
};

if (typeof Profile !== 'undefined') {
  [
    'parseCss',
    'stringifyCss',
    'minifyCss',
    'mergeCssAsts',
    'rewriteCssUrls',
  ].forEach(funcName => {
    CssTools[funcName] = Profile(`CssTools.${funcName}`, CssTools[funcName]);
  });
}

export { CssTools };

const hasOwn = Object.prototype.hasOwnProperty;

const rewriteRules = (rules, mergedCssPath) => {
  rules.forEach((rule) => {
    // Recurse if there are sub-rules. An example:
    //     @media (...) {
    //         .rule { url(...); }
    //     }
    if (hasOwn.call(rule, 'nodes')) {
      rewriteRules(rule.nodes, mergedCssPath);
    }

    const appDir = process.cwd();
    const sourceFile = rule.source.input.file;
    const sourceFileFromAppRoot =
      sourceFile ? sourceFile.replace(appDir, '') : '';
    let basePath = pathJoin('/', pathDirname(sourceFileFromAppRoot));

    // Set the correct basePath based on how the linked asset will be served.
    // XXX This is wrong. We are coupling the information about how files will
    // be served by the web server to the information how they were stored
    // originally on the filesystem in the project structure. Ideally, there
    // should be some module that tells us precisely how each asset will be
    // served but for now we are just assuming that everything that comes from
    // a folder starting with "/packages/" is served on the same path as
    // it was on the filesystem and everything else is served on root "/".
    if (! basePath.match(/^\/?packages\//i)) {
      basePath = "/";
    }

    let value = rule.value;

    // Match css values containing some functional calls to `url(URI)` where
    // URI is optionally quoted.
    // Note that a css value can contains other elements, for instance:
    //   background: top center url("background.png") black;
    // or even multiple url(), for instance for multiple backgrounds.
    var cssUrlRegex = /url\s*\(\s*(['"]?)(.+?)\1\s*\)/gi;
    let parts;
    while (parts = cssUrlRegex.exec(value)) {
      const oldCssUrl = parts[0];
      const quote = parts[1];
      const resource = url.parse(parts[2]);

      // We don't rewrite URLs starting with a protocol definition such as
      // http, https, or data, or those with network-path references
      // i.e. //img.domain.com/cat.gif
      if (resource.protocol !== null ||
          resource.href.startsWith('//') ||
          resource.href.startsWith('#')) {
        continue;
      }

      // Rewrite relative paths (that refers to the internal application tree)
      // to absolute paths (addressable from the public build).
      let absolutePath = isRelative(resource.path)
        ? pathJoin(basePath, resource.path)
        : resource.path;

      if (resource.hash) {
        absolutePath += resource.hash;
      }

      // We used to finish the rewriting process at the absolute path step
      // above. But it didn't work in case the Meteor application was deployed
      // under a sub-path (eg `ROOT_URL=http://localhost:3000/myapp meteor`)
      // in which case the resources linked in the merged CSS file would miss
      // the `myapp/` prefix. Since this path prefix is only known at launch
      // time (rather than build time) we can't use absolute paths to link
      // resources in the generated CSS.
      //
      // Instead we transform absolute paths to make them relative to the
      // merged CSS, leaving to the browser the responsibility to calculate
      // the final resource links (by adding the application deployment
      // prefix, here `myapp/`, if applicable).
      const relativeToMergedCss = pathRelative(mergedCssPath, absolutePath);
      const newCssUrl = `url(${quote}${relativeToMergedCss}${quote})`;
      value = value.replace(oldCssUrl, newCssUrl);
    }

    rule.value = value;
  });
};

const isRelative = path => path && path.charAt(0) !== '/';

// These are duplicates of functions in tools/files.js, because we don't have
// a good way of exporting them into packages.
// XXX deduplicate files.js into a package at some point so that we can use it
// in core
const toOSPath =
  p => process.platform === 'win32' ? p.replace(/\//g, '\\') : p;
const toStandardPath =
  p => process.platform === 'win32' ? p.replace(/\\/g, '/') : p;
const pathJoin =
  (a, b) => toStandardPath(path.join(toOSPath(a), toOSPath(b)));
const pathDirname =
  p => toStandardPath(path.dirname(toOSPath(p)));
const pathRelative =
  (p1, p2) => toStandardPath(path.relative(toOSPath(p1), toOSPath(p2)));
