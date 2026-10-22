// TODO Somehow expose a hash of these plugin options?
module.exports = function (api, options) {
  return {
    plugins: [
      ...require("./proposals.js").plugins,
      require("@babel/plugin-transform-arrow-functions"),
      require("@babel/plugin-transform-block-scoped-functions"),
      require("@babel/plugin-transform-block-scoping"),
      [require("@babel/plugin-transform-classes"), {
        loose: true
      }],
      [require("@babel/plugin-transform-computed-properties"), {
        loose: true
      }],
      require("@babel/plugin-transform-destructuring"),
      [require("@babel/plugin-transform-for-of"), {
        loose: true
      }],
      require("@babel/plugin-transform-literals"),
      require("@babel/plugin-transform-object-super"),
      require("@babel/plugin-transform-parameters"),
      require("@babel/plugin-transform-shorthand-properties"),
      require("@babel/plugin-transform-spread"),
      require("@babel/plugin-transform-sticky-regex"),
      [require("@babel/plugin-transform-template-literals"), {
        loose: true
      }],
      require("@babel/plugin-transform-typeof-symbol"),
      require("@babel/plugin-transform-unicode-regex"),
      require("@babel/plugin-transform-property-literals"),
      require("@babel/plugin-transform-exponentiation-operator"),
      require("@babel/plugin-transform-regenerator"),
    ]
  };
};
