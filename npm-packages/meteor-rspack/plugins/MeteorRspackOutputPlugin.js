// MeteorRspackOutputPlugin.js
//
// This plugin outputs a JSON stringified with a tag delimiter each time
// a new Rspack compilation happens. The JSON content is configurable
// via plugin instantiation options.

const { outputMeteorRspack } = require('../lib/meteorRspackHelpers');

class MeteorRspackOutputPlugin {
  constructor(options = {}) {
    this.pluginName = 'MeteorRspackOutputPlugin';
    this.options = options;
    this.compilationCount = 0;
    // The data to be output as JSON, can be a static object or a function
    this.getData =
      typeof options.getData === 'function'
        ? options.getData
        : () => options.data || {};
  }

  apply(compiler) {
    // Hook into the 'done' event which fires after each compilation completes
    compiler.hooks.done.tap(this.pluginName, stats => {
      this.compilationCount++;
      const data = {
        ...(this.getData(stats, {
          compilationCount: this.compilationCount,
          isRebuild: this.compilationCount > 1,
        }) || {}),
      };
      outputMeteorRspack(data);
    });
  }
}

module.exports = { MeteorRspackOutputPlugin };
