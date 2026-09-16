const fs = require('fs');
const path = require('path');

/**
 * Extract local file dependencies from a config file by parsing require/import statements using AST
 * @param {string} configFilePath - Path to the config file to parse
 * @returns {string[]} - Array of absolute paths to local dependencies
 */
function extractLocalDependencies(configFilePath) {
  if (!configFilePath || !fs.existsSync(configFilePath)) {
    return [];
  }

  try {
    const swc = require('@swc/core');
    const content = fs.readFileSync(configFilePath, 'utf-8');
    const configDir = path.dirname(configFilePath);
    const projectDir = process.cwd();
    const dependencies = [];

    // Parse the file into an AST
    const ast = swc.parseSync(content, {
      syntax: 'ecmascript',
      dynamicImport: true,
      target: 'es2020',
    });

    // Visit all nodes to find import/require statements
    visitNode(ast, (node) => {
      let modulePath = null;

      // Handle require() calls: require('./plugin')
      if (node.type === 'CallExpression' && 
          node.callee.type === 'Identifier' && 
          node.callee.value === 'require' &&
          node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (arg.expression?.type === 'StringLiteral') {
          modulePath = arg.expression.value;
        }
      }

      // Handle dynamic import() calls: import('./plugin')
      if (node.type === 'CallExpression' &&
          node.callee.type === 'Import' &&
          node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (arg.expression?.type === 'StringLiteral') {
          modulePath = arg.expression.value;
        }
      }

      // Handle static imports: import x from './plugin'
      if (node.type === 'ImportDeclaration' && node.source?.type === 'StringLiteral') {
        modulePath = node.source.value;
      }

      // Handle export re-exports: export * from './plugin'
      if (node.type === 'ExportAllDeclaration' && node.source?.type === 'StringLiteral') {
        modulePath = node.source.value;
      }

      // Handle named export re-exports: export { x } from './plugin'
      if (node.type === 'ExportNamedDeclaration' && node.source?.type === 'StringLiteral') {
        modulePath = node.source.value;
      }

      // If we found a module path, try to resolve it
      if (modulePath) {
        const resolvedPath = resolveLocalModule(modulePath, configDir, projectDir);
        if (resolvedPath) {
          dependencies.push(resolvedPath);
        }
      }
    });

    // Remove duplicates
    return [...new Set(dependencies)];
  } catch (error) {
    console.warn('[Rspack Cache] Failed to parse config dependencies:', error.message);
    return [];
  }
}

/**
 * Recursively visit all nodes in an AST
 * @param {Object} node - AST node
 * @param {Function} callback - Function to call for each node
 */
function visitNode(node, callback) {
  if (!node || typeof node !== 'object') {
    return;
  }

  callback(node);

  // Visit all properties of the node
  for (const key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(child => visitNode(child, callback));
      } else if (typeof value === 'object') {
        visitNode(value, callback);
      }
    }
  }
}

/**
 * Resolve a module path to an absolute path if it's a local file
 * @param {string} modulePath - Module path from require/import statement
 * @param {string} configDir - Directory containing the config file
 * @param {string} projectDir - Project root directory
 * @returns {string|null} - Resolved absolute path or null
 */
function resolveLocalModule(modulePath, configDir, projectDir) {
  // Only process relative paths (starts with . or ..)
  if (!modulePath.startsWith('.')) {
    return null;
  }

  try {
    let resolvedPath = path.resolve(configDir, modulePath);
    const extensions = ['.js', '.mjs', '.cjs', '.ts', '.json'];

    // If the path exists as-is, check if it's a directory needing index resolution
    if (fs.existsSync(resolvedPath)) {
      if (fs.statSync(resolvedPath).isDirectory()) {
        let found = false;
        for (const ext of extensions) {
          const indexPath = path.join(resolvedPath, `index${ext}`);
          if (fs.existsSync(indexPath)) {
            resolvedPath = indexPath;
            found = true;
            break;
          }
        }
        if (!found) {
          return null;
        }
      }
    } else {
      // Try common extensions if file doesn't exist as-is
      let found = false;

      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        if (fs.existsSync(pathWithExt)) {
          resolvedPath = pathWithExt;
          found = true;
          break;
        }
      }

      // If still not found, return null
      if (!found) {
        return null;
      }
    }

    // Verify file is within project (not node_modules)
    const resolvedReal = fs.realpathSync(resolvedPath);
    const projectReal = fs.realpathSync(projectDir);

    const isWithinProject = 
      resolvedReal === projectReal ||
      resolvedReal.startsWith(projectReal + path.sep);
    const hasNodeModulesSegment = resolvedReal.split(path.sep).includes('node_modules');

    if (isWithinProject && !hasNodeModulesSegment) {
      return resolvedPath;
    }
  } catch (error) {
    // Silently ignore resolution errors
  }

  return null;
}

module.exports = {
  extractLocalDependencies,
  resolveLocalModule,
};
