UglifyJSMinify = Npm.require('uglify-js').minify;

var cssParse = Npm.require('css-parse');
var cssStringify = Npm.require('css-stringify');

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
  }
};

