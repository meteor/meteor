const { defineConfig } = require('@meteorjs/rspack');

module.exports = defineConfig((Meteor) =>
  Meteor.extendConfig(Meteor.compileWithRspack([]), {})
);
