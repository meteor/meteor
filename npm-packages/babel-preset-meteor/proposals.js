module.exports = {
  plugins: [
    require("@babel/plugin-syntax-nullish-coalescing-operator"),
    require("@babel/plugin-transform-nullish-coalescing-operator"),

    require("@babel/plugin-syntax-optional-chaining"),
    require("@babel/plugin-transform-optional-chaining"),

    require("@babel/plugin-syntax-optional-catch-binding"),
    require("@babel/plugin-transform-optional-catch-binding"),

    require("@babel/plugin-syntax-class-properties"),
    require("@babel/plugin-transform-class-properties"),

    require("@babel/plugin-syntax-async-generators"),
    require("@babel/plugin-transform-async-generator-functions"),

    require("@babel/plugin-syntax-object-rest-spread"),
    require("@babel/plugin-transform-object-rest-spread"),

    require("@babel/plugin-transform-logical-assignment-operators")
  ]
};
