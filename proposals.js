exports.plugins = [
  require("@babel/plugin-syntax-nullish-coalescing-operator"),
  require("@babel/plugin-proposal-nullish-coalescing-operator"),

  require("@babel/plugin-syntax-optional-chaining"),
  require("@babel/plugin-proposal-optional-chaining"),

  require("@babel/plugin-syntax-optional-catch-binding"),
  require("@babel/plugin-proposal-optional-catch-binding"),

  require("@babel/plugin-syntax-class-properties"),
  require("@babel/plugin-proposal-class-properties"),

  require("@babel/plugin-syntax-async-generators"),
  require("@babel/plugin-proposal-async-generator-functions"),

  require("@babel/plugin-syntax-object-rest-spread"),
  require("@babel/plugin-proposal-object-rest-spread"),

  require("@babel/plugin-proposal-logical-assignment-operators"),
];
