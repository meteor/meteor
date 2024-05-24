import lodashTemplate from 'lodash.template';

// As identified in issue #9149, when an application overrides the default
// _.template settings using _.templateSettings, those new settings are
// used anywhere _.template is used, including within the
// boilerplate-generator. To handle this, _.template settings that have
// been verified to work are overridden here on each _.template call.
export default function template(text) {
  return lodashTemplate(text, null, {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g,
  });
};