const { parse: meteorBabelParser } = require('meteor-babel/parser.js');
const fs = require('fs');
const path = require('path');
const { parse } = require('recast');
const defaultParserOptions = require('reify/lib/parsers/babel.js').options;

// TODO: it would be better to have Babel compile the file first
// instead of handling some plugins specially, but that would
// require copying a large amount of code from Meteor's babel compiler
const { resolvePath } = require('babel-plugin-module-resolver');
const { visit } = require('ast-types');

function findBabelConfig(startDir, appDir) {
  const babelRcPath = path.join(startDir, '.babelrc');
  const packageJsonPath = path.join(startDir, 'package.json');
  if (fs.existsSync(babelRcPath)) {
    return [babelRcPath, 'babelrc'];
  }

  if (fs.existsSync(packageJsonPath)) {
    return [packageJsonPath, 'package.json'];
  }

  const parentDir = path.resolve(startDir, '..');
  if (!parentDir.includes(appDir)) {
    return false;
  }

  return findBabelConfig(parentDir, appDir);
}

function findModuleResolveConfig(filePath, appDir) {
  const fileDir = path.dirname(filePath);
  const [babelConfigPath, type] = findBabelConfig(fileDir, appDir);
  // console.error(`babelConfigPath`, babelConfigPath);
  if (babelConfigPath) {
    const babelConfigContent = fs.readFileSync(babelConfigPath, 'utf-8');
    // TODO: error handling
    const babelConfig = JSON.parse(babelConfigContent);
    if (type === 'package.json' && !babelConfig.babel) {
      return null;
    }
    const moduleResolvePluginConfig =
      babelConfig.plugins.find((plugin) => plugin[0] === 'module-resolver') ||
      [];
    return moduleResolvePluginConfig[1];
  }
}

module.exports = function readAndParse(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const ast = parse(content, {
    parser: {
      parse: (source) =>
        meteorBabelParser(source, {
          ...defaultParserOptions,
          tokens: true,
        }),
    },
  });

  return ast;
};

module.exports.findImports = function findImports(filePath, ast, appDir) {
  const moduleResolveConfig = findModuleResolveConfig(filePath, appDir);
  const result = [];

  // TODO: handle require
  visit(ast, {
    visitImportDeclaration(nodePath) {
      let importPath = nodePath.value.source.value;
      if (moduleResolveConfig) {
        const origPath = importPath;
        importPath =
          resolvePath(importPath, filePath, {
            ...moduleResolveConfig,
            cwd: appDir,
          }) || origPath;
      }
      result.push({
        source: importPath,
        specifiers: nodePath.value.specifiers,
      });
      return false;
    },
    visitExportNamedDeclaration(nodePath) {
      if (!nodePath.node.source) {
        return false;
      }

      let importPath = nodePath.node.source.value;
      if (moduleResolveConfig) {
        const origPath = importPath;
        importPath =
          resolvePath(importPath, filePath, {
            ...moduleResolveConfig,
            cwd: appDir,
          }) || origPath;
      }
      result.push({
        source: importPath,
      });
      return false;
    },
    visitCallExpression(nodePath) {
      if (nodePath.node.callee.type !== 'Import') {
        return this.traverse(nodePath);
      }
      if (nodePath.node.arguments[0].type !== 'StringLiteral') {
        throw new Error('Unable to handle non-string dynamic imports');
      }

      let importPath = nodePath.node.arguments[0].value;
      if (moduleResolveConfig) {
        const origPath = importPath;
        importPath =
          resolvePath(importPath, filePath, {
            ...moduleResolveConfig,
            cwd: appDir,
          }) || origPath;
      }
      result.push({
        source: importPath,
      });
      this.traverse(nodePath);
    },
  });

  return result;
};
