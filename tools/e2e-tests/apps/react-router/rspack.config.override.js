const { defineConfig } = require("@meteorjs/rspack");
const CustomConsoleLogPlugin = require('./plugins/CustomConsoleLogPlugin')

module.exports = defineConfig((Meteor) => {
  return {
    plugins: [
      new CustomConsoleLogPlugin()
    ],
  };
});
