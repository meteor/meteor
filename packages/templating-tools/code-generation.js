TemplatingTools.generateTemplateJS =
function generateTemplateJS(name, renderFuncCode) {
  const nameLiteral = JSON.stringify(name);
  const templateDotNameLiteral = JSON.stringify(`Template.${name}`);

  return `
Template.__checkName(${nameLiteral});
Template[${nameLiteral}] = new Template(${templateDotNameLiteral}, ${renderFuncCode});
`;
}

TemplatingTools.generateBodyJS =
function generateBodyJS(renderFuncCode) {
  return `
Template.body.addContent(${renderFuncCode});
Meteor.startup(Template.body.renderToDocument);
`;
}
