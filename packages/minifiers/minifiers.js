var cssParse = Npm.require('css-parse');
var cssStringify = Npm.require('css-stringify');
var url = Npm.require('url');
var path = Npm.require('path');
UglifyJS = Npm.require('uglify-js');
UglifyJSMinify = UglifyJS.minify;

CssTools = {
  parseCss: cssParse,
  stringifyCss: cssStringify,
  minifyCss: function (cssText) {
    return CssTools.minifyCssAst(cssParse(cssText));
  },
  minifyCssAst: function (cssAst) {
    return MinifyAst(cssAst);
  },
  mergeCssAsts: function (cssAsts, warnCb) {
    var rulesPredicate = function (rules) {
      if (! _.isArray(rules))
        rules = [rules];
      return function (node) {
        return _.contains(rules, node.type);
      }
    };

    // Simple concatenation of CSS files would break @import rules
    // located in the beginning of a file. Before concatenation, pull them to
    // the beginning of a new syntax tree so they always precede other rules.
    var newAst = {
      type: 'stylesheet',
      stylesheet: { rules: [] }
    };

    _.each(cssAsts, function (ast) {
      // Pick only the imports from the beginning of file ignoring @charset
      // rules as every file is assumed to be in UTF-8.
      var charsetRules = _.filter(ast.stylesheet.rules,
                                  rulesPredicate("charset"));

      if (_.any(charsetRules, function (rule) {
        // According to MDN, only 'UTF-8' and "UTF-8" are the correct encoding
        // directives representing UTF-8.
        return ! /^(['"])UTF-8\1$/.test(rule.charset);
      })) {
        warnCb(ast.filename, "@charset rules in this file will be ignored as UTF-8 is the only encoding supported");
      }

      ast.stylesheet.rules = _.reject(ast.stylesheet.rules,
                                      rulesPredicate("charset"));
      var importCount = 0;
      for (var i = 0; i < ast.stylesheet.rules.length; i++)
        if (! rulesPredicate(["import", "comment"])(ast.stylesheet.rules[i])) {
          importCount = i;
          break;
        }

      CssTools.rewriteCssUrls(ast);

      var imports = ast.stylesheet.rules.splice(0, importCount);
      newAst.stylesheet.rules = newAst.stylesheet.rules.concat(imports);

      // if there are imports left in the middle of file, warn user as it might
      // be a potential bug (imports are valid only in the beginning of file).
      if (_.any(ast.stylesheet.rules, rulesPredicate("import"))) {
        // XXX make this an error?
        warnCb(ast.filename, "there are some @import rules those are not taking effect as they are required to be in the beginning of the file");
      }

    });

    // Now we can put the rest of CSS rules into new AST
    _.each(cssAsts, function (ast) {
      newAst.stylesheet.rules =
        newAst.stylesheet.rules.concat(ast.stylesheet.rules);
    });

    return newAst;
  },

  // We are looking for all relative urls defined with the `url()` functional
  // notation and rewriting them to the equivalent absolute url using the
  // `position.source` path provided by css-parse
  // For performance reasons this function acts by side effect by modifying the
  // given AST without doing a deep copy.
  rewriteCssUrls: function (ast) {

    var isRelative = function(path) {
      return path && path.charAt(0) !== '/';
    };

    _.each(ast.stylesheet.rules, function(rule, ruleIndex) {
      var basePath = pathDirname(rule.position.source);

      // Set the correct basePath based on how the linked asset will be served.
      // XXX This is wrong. We are coupling the information about how files will
      // be served by the web server to the information how they were stored
      // originally on the filesystem in the project structure. Ideally, there
      // should be some module that tells us precisely how each asset will be
      // served but for now we are just assuming that everything that comes from
      // a folder starting with "/packages/" is served on the same path as
      // it was on the filesystem and everything else is served on root "/".
      if (! basePath.match(/^\/?packages\//i))
          basePath = "/";

      _.each(rule.declarations, function(declaration, declarationIndex) {
        var parts, resource, absolutePath, quotes, oldCssUrl, newCssUrl;
        var value = declaration.value;

        // Match css values containing some functional calls to `url(URI)` where
        // URI is optionally quoted.
        // Note that a css value can contains other elements, for instance:
        //   background: top center url("background.png") black;
        // or even multiple url(), for instance for multiple backgrounds.
        var cssUrlRegex = /url\s*\(\s*(['"]?)(.+?)\1\s*\)/gi;
        while (parts = cssUrlRegex.exec(value)) {
          oldCssUrl = parts[0];
          quotes = parts[1];
          resource = url.parse(parts[2]);

          // Rewrite relative paths to absolute paths.
          // We don't rewrite urls starting with a protocol definition such as
          // http, https, or data.
          if (isRelative(resource.path) && resource.protocol === null) {
            absolutePath = pathJoin(basePath, resource.path);
            newCssUrl = "url(" + quotes + absolutePath + quotes + ")";
            value = value.replace(oldCssUrl, newCssUrl);
          }
        }

        declaration.value = value;
      });
    });
  }
};

// These are duplicates of functions in tools/files.js, because we don't have
// a good way of exporting them into packages.
// XXX deduplicate files.js into a package at somepoint so that we can use it
// in core
var toOSPath = function (p) {
  if (process.platform === 'win32')
    return p.replace(/\//g, '\\');
  return p;
}

var toStandardPath = function (p) {
  if (process.platform === 'win32')
    return p.replace(/\\/g, '/');
  return p;
};

var pathJoin = function (a, b) {
  return toStandardPath(path.join(
    toOSPath(a),
    toOSPath(b)));
};

var pathDirname = function (p) {
  return toStandardPath(path.dirname(toOSPath(p)));
};
