const fs = require('fs');
const vm = require('vm');

/**
 * Reads and parses the SWC configuration file.
 * @param {string} file - The name of the SWC configuration file (default: '.swcrc')
 * @returns {Object|undefined} The parsed SWC configuration or undefined if an error occurs
 */
function getMeteorAppSwcrc(file = '.swcrc') {
  try {
    const filePath = `${process.cwd()}/${file}`;
    if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf-8');
      // Check if the content uses ES module syntax (export default)
      if (content.includes('export default')) {
        // Transform ES module syntax to CommonJS
        content = content.replace(/export\s+default\s+/, 'module.exports = ');
      }
      const script = new vm.Script(`
        (function() {
          const module = {};
          module.exports = {};
          (function(exports, module) {
            ${content}
          })(module.exports, module);
          return module.exports;
        })()
      `);
      const context = vm.createContext({ process });
      return script.runInContext(context);
    } else {
      // For .swcrc and other JSON files, parse as JSON
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    return undefined;
  }
}

/**
 * Checks for SWC configuration files and returns the configuration.
 * If the configuration has a baseUrl property, it will be set to process.cwd().
 * @returns {Object|undefined} The SWC configuration or undefined if no configuration exists
 */
function getMeteorAppSwcConfig() {
  const hasSwcRc = fs.existsSync(`${process.cwd()}/.swcrc`);
  const hasSwcJs = !hasSwcRc && fs.existsSync(`${process.cwd()}/swc.config.js`);

  if (!hasSwcRc && !hasSwcJs) {
    return undefined;
  }

  const swcFile = hasSwcJs ? 'swc.config.js' : '.swcrc';
  const config = getMeteorAppSwcrc(swcFile);

  // Set baseUrl to process.cwd() if it exists
  if (config?.jsc && config.jsc.baseUrl) {
    config.jsc.baseUrl = process.cwd();
  }

  return config;
}

module.exports = {
  getMeteorAppSwcrc,
  getMeteorAppSwcConfig
};
