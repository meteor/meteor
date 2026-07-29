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
    if (file.endsWith('.js') || file.endsWith('.ts')) {
      let content = fs.readFileSync(filePath, 'utf-8');
      
      if (file.endsWith('.ts')) {
        try {
          const swc = require('@swc/core');
          const result = swc.transformSync(content, {
            jsc: {
              parser: {
                syntax: 'typescript',
              },
              target: 'es2015',
            },
          });
          content = result.code;
        } catch (swcError) {
          content = content
            .replace(/import\s+type\s+.*?from\s+['"][^'"]+['"];?/g, '')
            .replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '')
            .replace(/import\s+['"][^'"]+['"];?/g, '')
            .replace(/export\s+default\s+/, 'module.exports = ')
            .replace(/export\s+/g, '')
            .replace(/:\s*\w+(\[\])?(\s*=)/g, '$2')
            .replace(/\(([^)]*?):\s*\w+(\[\])?\)/g, '($1)')
            .replace(/\):\s*\w+(\[\])?\s*\{/g, ') {')
            .replace(/interface\s+\w+\s*\{[^}]*\}/g, '')
            .replace(/type\s+\w+\s*=\s*[^;]+;/g, '')
            .replace(/as\s+\w+(\[\])?/g, '');
        }
      }
      
      if (content.includes('export default')) {
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
      const result = script.runInContext(context);
      // Handle CJS interop wrapper (e.g. { __esModule: true, default: config })
      return result && result.__esModule && result.default ? result.default : result;
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
  const hasSwcTs = !hasSwcRc && !hasSwcJs && fs.existsSync(`${process.cwd()}/swc.config.ts`);

  if (!hasSwcRc && !hasSwcJs && !hasSwcTs) {
    return undefined;
  }

  const swcFile = hasSwcTs ? 'swc.config.ts' : hasSwcJs ? 'swc.config.js' : '.swcrc';
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
