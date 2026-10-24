const path = require('path');

module.exports = function () {
  const { projectDir, bridgeModuleId } = this.getOptions();
  const templateId = '/' + path.relative(projectDir, this.resourcePath).split(path.sep).join('/');
  // Meteor compiles the HTML. The chunk loader preloads lazy templates before
  // this synchronous adapter runs. Keep the actual HTML require indirect so
  // Meteor's scanner does not pull async templates into the initial bundle.
  return `module.exports = __non_webpack_require__(${JSON.stringify(bridgeModuleId)}).require(${JSON.stringify(templateId)});`;
};
