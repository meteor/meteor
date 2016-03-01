// TODO Somehow expose a hash of these plugin options?
module.exports = {
  plugins: [
    [require("babel-plugin-transform-runtime"), {
      // Avoid importing polyfills for things like Object.keys, which
      // Meteor already shims in other ways.
      polyfill: false
    }],
    require("babel-plugin-check-es2015-constants"),
    require("babel-plugin-syntax-flow"),
    require("babel-plugin-syntax-trailing-function-commas"),
    require("babel-plugin-syntax-async-functions"),
    require("babel-plugin-syntax-async-generators"),
    require("babel-plugin-transform-es2015-arrow-functions"),
    require("babel-plugin-transform-es2015-block-scoped-functions"),
    require("babel-plugin-transform-es2015-block-scoping"),
    [require("babel-plugin-transform-es2015-classes"), {
      loose: true
    }],
    [require("babel-plugin-transform-es2015-computed-properties"), {
      loose: true
    }],
    require("babel-plugin-transform-es2015-destructuring"),
    [require("babel-plugin-transform-es2015-for-of"), {
      loose: true
    }],
    require("babel-plugin-transform-es2015-function-name"),
    require("babel-plugin-transform-es2015-literals"),
    require("./plugins/sloppy-modules.js"),
    require("babel-plugin-transform-es2015-object-super"),
    require("babel-plugin-transform-es2015-parameters"),
    require("babel-plugin-transform-es2015-shorthand-properties"),
    require("babel-plugin-transform-es2015-spread"),
    require("babel-plugin-transform-es2015-sticky-regex"),
    [require("babel-plugin-transform-es2015-template-literals"), {
      loose: true
    }],
    require("babel-plugin-transform-es2015-typeof-symbol"),
    require("babel-plugin-transform-es2015-unicode-regex"),
    require("babel-plugin-syntax-object-rest-spread"),
    require("babel-plugin-transform-object-rest-spread"),
    require("babel-plugin-transform-es3-member-expression-literals"),
    require("babel-plugin-transform-es3-property-literals"),
    require("babel-plugin-transform-flow-strip-types"),
    require("babel-plugin-transform-regenerator")
  ]
};
