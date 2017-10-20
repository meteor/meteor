// Template function for rendering the boilerplate html for browsers

// As identified in issue #9149, when an application overrides the default
// _.template settings using _.templateSettings, those new settings are
// used anywhere _.template is used, including within the
// boilerplate-generator. To handle this, _.template settings that have
// been verified to work are overridden here on each _.template call.
const template = text => {
  return _.template(text, null, {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g,
  });
};

export default function({
  meteorRuntimeConfig,
  rootUrlPathPrefix,
  inlineScriptsAllowed,
  css,
  js,
  additionalStaticJs,
  htmlAttributes,
  bundledJsCssUrlRewriteHook,
  head,
  body,
  dynamicHead,
  dynamicBody,
}) {
  return [].concat(
    [
      '<html' +_.map(htmlAttributes, (value, key) =>
        template(' <%= attrName %>="<%- attrValue %>"')({
          attrName: key,
          attrValue: value
        })
      ).join('') + '>',
      '<head>'
    ],

    _.map(css, ({url}) =>
      template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>">')({
        href: bundledJsCssUrlRewriteHook(url)
      })
    ),

    [
      head,
      dynamicHead,
      '</head>',
      '<body>',
      body,
      dynamicBody,
      '',
      (inlineScriptsAllowed
        ? template('  <script type="text/javascript">__meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>))</script>')({
          conf: meteorRuntimeConfig
        })
        : template('  <script type="text/javascript" src="<%- src %>/meteor_runtime_config.js"></script>')({
          src: rootUrlPathPrefix
        })
      ) ,
      ''
    ],

    _.map(js, ({url}) =>
      template('  <script type="text/javascript" src="<%- src %>"></script>')({
        src: bundledJsCssUrlRewriteHook(url)
      })
    ),

    _.map(additionalStaticJs, ({contents, pathname}) => (
      (inlineScriptsAllowed
        ? template('  <script><%= contents %></script>')({
          contents: contents
        })
        : template('  <script type="text/javascript" src="<%- src %>"></script>')({
          src: rootUrlPathPrefix + pathname
        }))
    )),

    [
      '', '',
      '</body>',
      '</html>'
    ],
  ).join('\n');
}
